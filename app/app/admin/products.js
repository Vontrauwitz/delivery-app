import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as productsApi from '../../src/modules/products/api';
import { formatCurrency } from '../../src/shared/money';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
];

// The manager-defined canonical order (product.order ascending) — kept separate from
// SORT_OPTIONS since it renders with its own compact/icon treatment to the left of the rest,
// not as just another item in that row.
const ORDER_SORT = { value: 'order-asc', label: 'Orden base', icon: '☰' };

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Nombre A–Z' },
  { value: 'name-desc', label: 'Nombre Z–A' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
];

// Below this width, one column of inset rows reads best (phone / Fold closed). At or above it,
// there's room for a card grid — flexWrap + a per-card min/max width (not a device check) is
// what actually decides 2 vs 3 columns as the window grows, matching the same auto-fill
// technique already used for the sale-edit product picker.
const COMPACT_BREAKPOINT = 700;
// Caps the grid's width on very wide desktop windows so cards don't stretch edge-to-edge.
const GRID_MAX_WIDTH = 960;

export default function ProductsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BREAKPOINT;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // The manager-defined catalog order is the canonical/default view.
  const [sortBy, setSortBy] = useState(ORDER_SORT.value);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await productsApi.listProducts(token);
      setProducts(data);
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los productos');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Search and status filter narrow the set first; sorting then applies to whatever's left —
  // all client-side, since the whole catalog is already loaded in memory.
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = products;
    if (query) {
      list = list.filter((p) => p.name.toLowerCase().includes(query));
    }
    if (statusFilter === 'active') {
      list = list.filter((p) => p.active);
    } else if (statusFilter === 'inactive') {
      list = list.filter((p) => !p.active);
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'price-asc':
        sorted.sort((a, b) => a.basePrice - b.basePrice);
        break;
      case 'price-desc':
        sorted.sort((a, b) => b.basePrice - a.basePrice);
        break;
      case ORDER_SORT.value:
      default:
        // The canonical catalog order — also the safe fallback for any unrecognized value.
        sorted.sort((a, b) => a.order - b.order);
    }
    return sorted;
  }, [products, search, statusFilter, sortBy]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Productos" backHref="/admin" onRefresh={load} refreshing={loading} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <Pressable style={styles.newButton} onPress={() => router.push('/admin/product/new')}>
        <Text style={styles.newButtonText}>+ Nuevo producto</Text>
      </Pressable>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar producto…"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, statusFilter === option.value && styles.chipActive]}
            onPress={() => setStatusFilter(option.value)}
          >
            <Text style={[styles.chipText, statusFilter === option.value && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.chipRow}>
        {/* Manager-defined order — visually distinct (accent border) and to the left of the rest
            so it reads as "restore the base order", not just another sort choice. Compact
            icon-only on narrow layouts; the accessible label always says "Orden base". */}
        <Pressable
          style={[styles.orderChip, sortBy === ORDER_SORT.value && styles.chipActive]}
          onPress={() => setSortBy(ORDER_SORT.value)}
          accessibilityRole="button"
          accessibilityLabel={ORDER_SORT.label}
        >
          <Text style={[styles.chipText, sortBy === ORDER_SORT.value && styles.chipTextActive]}>
            {isCompact ? ORDER_SORT.icon : `${ORDER_SORT.icon} ${ORDER_SORT.label}`}
          </Text>
        </Pressable>
        {SORT_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.sortChip, sortBy === option.value && styles.chipActive]}
            onPress={() => setSortBy(option.value)}
          >
            <Text style={[styles.chipText, sortBy === option.value && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loadingIndicator} color={colors.primary} />
      ) : products.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay productos.</Text>
      ) : visibleProducts.length === 0 ? (
        <Text style={styles.empty}>No se encontraron productos.</Text>
      ) : isCompact ? (
        <View style={styles.listCard}>
          {visibleProducts.map((product, index) => (
            <Pressable
              key={product._id}
              style={[styles.row, index === visibleProducts.length - 1 && styles.rowLast]}
              onPress={() => router.push(`/admin/product/${product._id}`)}
            >
              <Text style={styles.icon}>{product.icon || '📦'}</Text>
              <View style={styles.info}>
                <Text style={styles.name}>{product.name}</Text>
                <Text style={styles.price}>{formatCurrency(product.basePrice)}</Text>
              </View>
              <View style={[styles.statusPill, product.active ? styles.statusActive : styles.statusInactive]}>
                <Text style={[styles.statusText, product.active ? styles.statusTextActive : styles.statusTextInactive]}>
                  {product.active ? 'Activo' : 'Inactivo'}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          {visibleProducts.map((product) => (
            <Pressable key={product._id} style={styles.card} onPress={() => router.push(`/admin/product/${product._id}`)}>
              <Text style={styles.cardIcon}>{product.icon || '📦'}</Text>
              <Text style={styles.cardName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={styles.cardPrice}>{formatCurrency(product.basePrice)}</Text>
              <View style={[styles.statusPill, product.active ? styles.statusActive : styles.statusInactive]}>
                <Text style={[styles.statusText, product.active ? styles.statusTextActive : styles.statusTextInactive]}>
                  {product.active ? 'Activo' : 'Inactivo'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: GRID_MAX_WIDTH, alignSelf: 'center', width: '100%' },
  error: { color: colors.danger, marginBottom: spacing.sm },
  empty: { ...typography.callout, color: colors.textSecondary, marginTop: spacing.xl, textAlign: 'center' },
  loadingIndicator: { marginTop: spacing.xl },

  newButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...softShadow,
  },
  newButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  orderChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },

  listCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rowLast: { borderBottomWidth: 0 },
  icon: { fontSize: 28 },
  info: { flex: 1 },
  name: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  price: { ...typography.callout, color: colors.textSecondary, marginTop: 2 },
  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusActive: { backgroundColor: colors.successMuted },
  statusInactive: { backgroundColor: colors.neutralMuted },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: colors.success },
  statusTextInactive: { color: colors.neutral },
  chevron: { color: colors.textTertiary, fontSize: 18 },

  // Tablet/desktop grid — flexBasis + flexGrow + maxWidth is the same auto-fill technique used
  // for the sale-edit product picker: pure flexbox reflow, no device-specific breakpoints beyond
  // the single compact/grid switch above.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  card: {
    flexGrow: 1,
    flexBasis: 220,
    maxWidth: 300,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    ...softShadow,
  },
  cardIcon: { fontSize: 34, marginBottom: spacing.xs },
  cardName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  cardPrice: { ...typography.callout, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
});
