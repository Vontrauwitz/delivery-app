import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as productsApi from '../../src/modules/products/api';
import * as promotionsApi from '../../src/modules/promotions/api';
import { calculateLineSubtotal } from '../../src/shared/pricing';
import { formatCurrency } from '../../src/shared/money';
import ScreenHeader from '../../src/shared/ScreenHeader';

const PREVIEW_QUANTITIES = [1, 2, 3, 4];

function PreviewTable({ basePrice, quantity, bundlePrice }) {
  // quantity/bundlePrice are raw text-input strings — an empty field must never be treated as 0,
  // or an untouched "Por" input would silently preview a $0 bundle price.
  const promo = { quantity: Number(quantity), bundlePrice: Number(bundlePrice) };
  const valid =
    quantity !== '' &&
    bundlePrice !== '' &&
    Number.isInteger(promo.quantity) &&
    promo.quantity >= 2 &&
    Number.isFinite(promo.bundlePrice) &&
    promo.bundlePrice >= 0;

  return (
    <View style={styles.previewBox}>
      <Text style={styles.previewTitle}>Vista previa</Text>
      {PREVIEW_QUANTITIES.map((n) => (
        <View key={n} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{n}</Text>
          <Text style={styles.previewValue}>
            {valid ? formatCurrency(calculateLineSubtotal(basePrice, n, promo)) : '—'}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function PromotionsScreen() {
  const { token } = useAuth();

  const [products, setProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [quantityInput, setQuantityInput] = useState('2');
  const [bundlePriceInput, setBundlePriceInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editBundlePrice, setEditBundlePrice] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [productsData, promotionsData] = await Promise.all([
        productsApi.listProducts(token),
        promotionsApi.listPromotions(token),
      ]);
      setProducts(productsData.filter((p) => p.active));
      setPromotions(promotionsData);
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar las promociones');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // A product with an existing active promotion is hidden from "create new" — editing/deactivating
  // it first is the only way to add a different rule for that product (matches the backend's
  // one-active-promotion-per-product rule, so the picker never offers a choice that would fail).
  const promotableProducts = useMemo(() => {
    const activeProductIds = new Set(promotions.filter((p) => p.active).map((p) => p.product._id));
    return products.filter((p) => !activeProductIds.has(p._id));
  }, [products, promotions]);

  const selectedProduct = products.find((p) => p._id === selectedProductId);

  async function handleCreate() {
    setCreateError('');
    if (!selectedProductId) {
      setCreateError('Selecciona un producto');
      return;
    }
    const quantity = Number(quantityInput);
    if (!Number.isInteger(quantity) || quantity < 2) {
      setCreateError('La cantidad debe ser un número entero de al menos 2 unidades');
      return;
    }
    const bundlePrice = Number(bundlePriceInput);
    if (!Number.isFinite(bundlePrice) || bundlePrice < 0) {
      setCreateError('El precio debe ser un número válido');
      return;
    }
    setCreating(true);
    try {
      await promotionsApi.createPromotion(token, { product: selectedProductId, quantity, bundlePrice });
      setSelectedProductId(null);
      setQuantityInput('2');
      setBundlePriceInput('');
      await load();
    } catch (err) {
      setCreateError(err.message || 'No se pudo crear la promoción');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(promo) {
    setEditingId(promo._id);
    setEditQuantity(String(promo.quantity));
    setEditBundlePrice(String(promo.bundlePrice));
    setEditError('');
  }

  async function saveEdit(promo) {
    setEditError('');
    const quantity = Number(editQuantity);
    if (!Number.isInteger(quantity) || quantity < 2) {
      setEditError('La cantidad debe ser un número entero de al menos 2 unidades');
      return;
    }
    const bundlePrice = Number(editBundlePrice);
    if (!Number.isFinite(bundlePrice) || bundlePrice < 0) {
      setEditError('El precio debe ser un número válido');
      return;
    }
    setEditSaving(true);
    try {
      await promotionsApi.updatePromotion(token, promo._id, { quantity, bundlePrice });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err.message || 'No se pudo guardar la promoción');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(promo) {
    setTogglingId(promo._id);
    try {
      if (promo.active) {
        await promotionsApi.deactivatePromotion(token, promo._id);
      } else {
        await promotionsApi.activatePromotion(token, promo._id);
      }
      await load();
    } catch (err) {
      setLoadError(err.message || 'No se pudo actualizar la promoción');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Promociones" backHref="/admin" onRefresh={load} refreshing={loading} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <Text style={styles.sectionTitle}>Nueva promoción</Text>
      <Text style={styles.label}>Producto</Text>
      <View style={styles.chipRow}>
        {promotableProducts.map((p) => (
          <Pressable
            key={p._id}
            style={[styles.chip, p._id === selectedProductId && styles.chipActive]}
            onPress={() => setSelectedProductId(p._id)}
          >
            <Text style={[styles.chipText, p._id === selectedProductId && styles.chipTextActive]}>
              {p.icon} {p.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {!loading && promotableProducts.length === 0 && (
        <Text style={styles.empty}>Todos los productos ya tienen una promoción activa.</Text>
      )}

      {selectedProduct && (
        <>
          <Text style={styles.normalPrice}>Precio normal: {formatCurrency(selectedProduct.basePrice)}</Text>

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={styles.label}>Compra</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={quantityInput}
                onChangeText={setQuantityInput}
                placeholder="2"
              />
              <Text style={styles.hint}>unidades</Text>
            </View>
            <View style={styles.rowField}>
              <Text style={styles.label}>Por</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={bundlePriceInput}
                onChangeText={setBundlePriceInput}
                placeholder="100"
              />
              <Text style={styles.hint}>precio total</Text>
            </View>
          </View>

          <PreviewTable basePrice={selectedProduct.basePrice} quantity={quantityInput} bundlePrice={bundlePriceInput} />

          {createError ? <Text style={styles.error}>{createError}</Text> : null}
          <Pressable style={styles.button} onPress={handleCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear promoción</Text>}
          </Pressable>
        </>
      )}

      <Text style={styles.sectionTitle}>Promociones existentes</Text>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} />
      ) : promotions.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay promociones. Crea una arriba.</Text>
      ) : (
        promotions.map((promo) => {
          const isEditing = editingId === promo._id;
          return (
            <View key={promo._id} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardProduct}>
                  {promo.product.icon} {promo.product.name}
                </Text>
                <View style={[styles.statusPill, promo.active ? styles.statusActive : styles.statusInactive]}>
                  <Text style={[styles.statusText, promo.active ? styles.statusTextActive : styles.statusTextInactive]}>
                    {promo.active ? 'Activa' : 'Inactiva'}
                  </Text>
                </View>
              </View>

              {isEditing ? (
                <>
                  <View style={styles.row}>
                    <View style={styles.rowField}>
                      <Text style={styles.label}>Compra</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={editQuantity} onChangeText={setEditQuantity} />
                      <Text style={styles.hint}>unidades</Text>
                    </View>
                    <View style={styles.rowField}>
                      <Text style={styles.label}>Por</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={editBundlePrice} onChangeText={setEditBundlePrice} />
                      <Text style={styles.hint}>precio total</Text>
                    </View>
                  </View>
                  <PreviewTable basePrice={promo.product.basePrice} quantity={editQuantity} bundlePrice={editBundlePrice} />
                  {editError ? <Text style={styles.error}>{editError}</Text> : null}
                  <View style={styles.cardActionsRow}>
                    <Pressable style={styles.smallButton} onPress={() => saveEdit(promo)} disabled={editSaving}>
                      {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.smallButtonText}>Guardar</Text>}
                    </Pressable>
                    <Pressable style={styles.smallButtonGhost} onPress={() => setEditingId(null)}>
                      <Text style={styles.smallButtonGhostText}>Cancelar</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.cardDescription}>
                    Compra {promo.quantity} por {formatCurrency(promo.bundlePrice)}
                  </Text>
                  <Text style={styles.cardMeta}>Precio normal: {formatCurrency(promo.product.basePrice)}</Text>
                  <View style={styles.cardActionsRow}>
                    <Pressable style={styles.smallButtonGhost} onPress={() => startEdit(promo)}>
                      <Text style={styles.smallButtonGhostText}>Editar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, promo.active ? styles.deactivateButton : styles.activateButton]}
                      onPress={() => toggleActive(promo)}
                      disabled={togglingId === promo._id}
                    >
                      {togglingId === promo._id ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.smallButtonText}>{promo.active ? 'Desactivar' : 'Activar'}</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  label: { fontSize: 13, color: '#444', marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#2563eb', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  normalPrice: { fontSize: 14, color: '#333', marginTop: 12 },
  row: { flexDirection: 'row', gap: 12, marginTop: 12 },
  rowField: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { fontSize: 11, color: '#888', marginTop: 2 },
  previewBox: { marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10 },
  previewTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 6 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewLabel: { fontSize: 13, color: '#666' },
  previewValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardProduct: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  cardDescription: { fontSize: 14, color: '#333', marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusActive: { backgroundColor: '#dcfce7' },
  statusInactive: { backgroundColor: '#f1f5f9' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: '#16a34a' },
  statusTextInactive: { color: '#64748b' },
  cardActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  smallButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  smallButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  smallButtonGhost: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center' },
  smallButtonGhostText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  activateButton: { backgroundColor: '#16a34a' },
  deactivateButton: { backgroundColor: '#dc2626' },
});
