import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as productsApi from '../../../src/modules/products/api';
import * as promotionsApi from '../../../src/modules/promotions/api';
import { formatCurrency } from '../../../src/shared/money';
import ScreenHeader from '../../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../../src/shared/theme';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const isNew = id === 'new';
  const { token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  // '' means "no custom icon yet" — the box shows a dim default-icon placeholder for that state
  // instead of baking a real '📦' into the value, so the field and the stored data can never
  // disagree about whether a custom icon was actually set.
  const [icon, setIcon] = useState('');
  const [orderInput, setOrderInput] = useState('0');
  const [active, setActive] = useState(true);
  // Current active promotion, if any — just enough to render the compact summary row; editing
  // happens on its own dedicated screen, not inline here.
  const [promotion, setPromotion] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [banner, setBanner] = useState('');

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setLoadError('');
    try {
      const [data, promotions] = await Promise.all([
        productsApi.getProduct(token, id),
        promotionsApi.listPromotions(token, { product: id, active: 'true' }),
      ]);
      setName(data.name);
      setPriceInput(String(data.basePrice));
      setIcon(data.icon || '');
      setOrderInput(String(data.order ?? 0));
      setActive(data.active);
      setPromotion(promotions[0] || null);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar el producto');
    } finally {
      setLoading(false);
    }
  }, [token, id, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  const price = Number(priceInput);
  const order = orderInput === '' ? 0 : Number(orderInput);
  const nameOk = name.trim().length > 0;
  const priceOk = priceInput !== '' && Number.isFinite(price) && price >= 0;
  const orderOk = Number.isFinite(order);
  const canSave = nameOk && priceOk && orderOk && !saving;

  function buildPayload(overrides = {}) {
    return {
      name: name.trim(),
      basePrice: price,
      // Stored as-is, including empty — every place that displays a product icon already falls
      // back to '📦' for a missing one (ProductCard, the products list, this same screen's
      // preview), so there's no need to bake a default into the stored value here.
      icon: icon.trim(),
      order,
      active,
      ...overrides,
    };
  }

  async function handleSave() {
    setSaveError('');
    setBanner('');
    if (!nameOk || !priceOk || !orderOk) {
      setSaveError('Revisa el nombre, el precio y el orden antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await productsApi.createProduct(token, buildPayload());
      } else {
        await productsApi.updateProduct(token, id, buildPayload());
      }
      // A confirmed successful save/create is done — return to the catalog immediately rather
      // than leaving the manager on a form that says "saved" but looks like nothing happened.
      router.replace('/admin/products');
    } catch (err) {
      setSaveError(err.message || 'No se pudo guardar el producto');
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setSaveError('');
    setBanner('');
    setSaving(true);
    try {
      const updated = await productsApi.updateProduct(token, id, buildPayload({ active: !active }));
      setActive(updated.active);
      setBanner(updated.active ? 'Producto activado.' : 'Producto desactivado.');
    } catch (err) {
      setSaveError(err.message || 'No se pudo actualizar el producto');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleteError('');
    setDeleting(true);
    try {
      await productsApi.deleteProduct(token, id);
      router.replace('/admin/products');
    } catch (err) {
      setDeleteError(err.message || 'No se pudo eliminar el producto');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title={isNew ? 'Nuevo producto' : 'Producto'} backHref="/admin/products" />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Producto" backHref="/admin/products" />
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title={isNew ? 'Nuevo producto' : name || 'Producto'} backHref="/admin/products" />

      {banner ? <Text style={styles.success}>{banner}</Text> : null}
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <View style={styles.formCard}>
        <View style={styles.previewRow}>
          <Text style={styles.previewIcon}>{icon || '📦'}</Text>
          <View>
            <Text style={styles.previewName}>{name || 'Nombre del producto'}</Text>
            <View style={[styles.statusPill, active ? styles.statusActive : styles.statusInactive]}>
              <Text style={[styles.statusText, active ? styles.statusTextActive : styles.statusTextInactive]}>
                {active ? 'Activo' : 'Inactivo'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej. Perro" placeholderTextColor={colors.textTertiary} />

        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Precio</Text>
            <TextInput
              style={styles.input}
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Icono</Text>
            {/* Emoji glyphs ignore placeholderTextColor entirely (they're pre-colored glyphs,
                not tinted text), so a native placeholder can't look "dim". This overlay renders
                only while the field is genuinely empty, and disappears the instant any custom
                icon is typed — never a stale glyph left behind the cursor. */}
            <View style={styles.iconFieldWrap}>
              <TextInput style={[styles.input, styles.iconInput]} value={icon} onChangeText={setIcon} placeholder="" />
              {icon.trim() === '' && (
                <Text style={styles.iconPlaceholder} pointerEvents="none">
                  📦
                </Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.label}>Orden</Text>
        <TextInput
          style={styles.input}
          value={orderInput}
          onChangeText={setOrderInput}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.hint}>Determina el lugar del producto en la grilla — menor primero.</Text>

        <Pressable style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{isNew ? 'Crear producto' : 'Guardar cambios'}</Text>}
        </Pressable>
      </View>

      {!isNew && (
        <Pressable style={styles.promoRow} onPress={() => router.push(`/admin/promotion/${id}`)}>
          <View>
            <Text style={styles.promoLabel}>Promoción</Text>
            <Text style={styles.promoValue}>
              {promotion ? `${promotion.quantity} por ${formatCurrency(promotion.bundlePrice)}` : 'Sin promoción'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      {!isNew && (
        <View style={styles.dangerCard}>
          <Pressable style={styles.toggleButton} onPress={handleToggleActive} disabled={saving}>
            <Text style={styles.toggleButtonText}>{active ? 'Desactivar producto' : 'Activar producto'}</Text>
          </Pressable>
          <Text style={styles.toggleHint}>
            {active
              ? 'Un producto desactivado desaparece de la venta del chofer, pero su historial se conserva.'
              : 'Al reactivarlo, vuelve a aparecer en la venta del chofer.'}
          </Text>

          {!confirmingDelete ? (
            <Pressable style={styles.deleteLink} onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <Text style={styles.deleteLinkText}>Eliminar producto</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                ¿Eliminar "{name}" permanentemente? Solo es posible si nunca se ha usado en ventas, inventario,
                promociones o reposición.
              </Text>
              {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
              <View style={styles.confirmActionsRow}>
                <Pressable style={styles.confirmDeleteButton} onPress={handleConfirmDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDeleteButtonText}>Confirmar eliminación</Text>}
                </Pressable>
                <Pressable style={styles.confirmCancelButton} onPress={() => setConfirmingDelete(false)} disabled={deleting}>
                  <Text style={styles.confirmCancelButtonText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, marginBottom: spacing.sm },
  success: { color: colors.success, marginBottom: spacing.sm },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  previewIcon: { fontSize: 40 },
  previewName: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.xs },

  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  statusActive: { backgroundColor: colors.successMuted },
  statusInactive: { backgroundColor: colors.neutralMuted },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: colors.success },
  statusTextInactive: { color: colors.neutral },

  label: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.background,
    color: colors.textPrimary,
  },
  iconInput: { fontSize: 22, textAlign: 'center' },
  iconFieldWrap: { justifyContent: 'center' },
  iconPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingVertical: spacing.md,
    fontSize: 22,
    opacity: 0.3,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  fieldHalf: { flex: 1 },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  promoRow: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoLabel: { ...typography.subhead, color: colors.textSecondary },
  promoValue: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  chevron: { color: colors.textTertiary, fontSize: 18 },

  dangerCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  toggleButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  toggleButtonText: { color: colors.textPrimary, fontWeight: '600', fontSize: 15 },
  toggleHint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },

  deleteLink: { alignItems: 'center', marginTop: spacing.lg },
  deleteLinkText: { color: colors.danger, fontSize: 14, fontWeight: '600' },

  confirmBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.dangerMuted, borderRadius: radii.lg },
  confirmText: { ...typography.callout, color: colors.textPrimary, marginBottom: spacing.sm },
  confirmActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  confirmDeleteButton: { flex: 1, backgroundColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  confirmDeleteButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  confirmCancelButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  confirmCancelButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
});
