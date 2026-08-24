import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as productsApi from '../../../src/modules/products/api';
import * as promotionsApi from '../../../src/modules/promotions/api';
import { calculateLineSubtotal } from '../../../src/shared/pricing';
import { formatCurrency } from '../../../src/shared/money';
import ScreenHeader from '../../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../../src/shared/theme';

const PREVIEW_QUANTITIES = [1, 2, 3, 4];

function PreviewTable({ basePrice, quantity, bundlePrice }) {
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
          <Text style={styles.previewValue}>{valid ? formatCurrency(calculateLineSubtotal(basePrice, n, promo)) : '—'}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ProductPromotionScreen() {
  const { productId } = useLocalSearchParams();
  const { token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [product, setProduct] = useState(null);
  const [promotion, setPromotion] = useState(null);

  const [quantityInput, setQuantityInput] = useState('2');
  const [bundlePriceInput, setBundlePriceInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [productData, promotions] = await Promise.all([
        productsApi.getProduct(token, productId),
        promotionsApi.listPromotions(token, { product: productId }),
      ]);
      setProduct(productData);
      // Most recent one, active or not — lets the manager reactivate/edit a lapsed promotion
      // instead of only ever being offered "create a new one" once one has been deactivated.
      const current = promotions[0] || null;
      setPromotion(current);
      setQuantityInput(current ? String(current.quantity) : '2');
      setBundlePriceInput(current ? String(current.bundlePrice) : '');
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la promoción');
    } finally {
      setLoading(false);
    }
  }, [token, productId]);

  useEffect(() => {
    load();
  }, [load]);

  const quantity = Number(quantityInput);
  const bundlePrice = Number(bundlePriceInput);
  const quantityOk = Number.isInteger(quantity) && quantity >= 2;
  const bundlePriceOk = bundlePriceInput !== '' && Number.isFinite(bundlePrice) && bundlePrice >= 0;
  const canSave = quantityOk && bundlePriceOk && !saving;

  async function handleSave() {
    setSaveError('');
    if (!quantityOk || !bundlePriceOk) {
      setSaveError('La cantidad debe ser un entero de al menos 2, y el precio un número válido.');
      return;
    }
    setSaving(true);
    try {
      if (promotion) {
        await promotionsApi.updatePromotion(token, promotion._id, { quantity, bundlePrice });
      } else {
        await promotionsApi.createPromotion(token, { product: productId, quantity, bundlePrice });
      }
      // Confirmed success — return to the product screen immediately, same as the product
      // save flow: no banner-then-wait, no timeout.
      router.replace(`/admin/product/${productId}`);
    } catch (err) {
      setSaveError(err.message || 'No se pudo guardar la promoción');
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    setToggleError('');
    setToggling(true);
    try {
      if (promotion.active) {
        await promotionsApi.deactivatePromotion(token, promotion._id);
      } else {
        await promotionsApi.activatePromotion(token, promotion._id);
      }
      await load();
    } catch (err) {
      setToggleError(err.message || 'No se pudo actualizar la promoción');
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Promoción" backHref={`/admin/product/${productId}`} />
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
          <ScreenHeader title="Promoción" backHref={`/admin/product/${productId}`} />
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Promoción" backHref={`/admin/product/${productId}`} />

      <Text style={styles.productLine}>
        {product.icon} {product.name} — {formatCurrency(product.basePrice)} c/u
      </Text>

      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}

      <View style={styles.formCard}>
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Compra</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={quantityInput}
              onChangeText={setQuantityInput}
              placeholder="2"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.hint}>unidades</Text>
          </View>
          <View style={styles.fieldHalf}>
            <Text style={styles.label}>Por</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={bundlePriceInput}
              onChangeText={setBundlePriceInput}
              placeholder="100"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.hint}>precio total</Text>
          </View>
        </View>

        <PreviewTable basePrice={product.basePrice} quantity={quantityInput} bundlePrice={bundlePriceInput} />

        <Pressable style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{promotion ? 'Guardar cambios' : 'Crear promoción'}</Text>}
        </Pressable>
      </View>

      {promotion && (
        <View style={styles.toggleCard}>
          {toggleError ? <Text style={styles.error}>{toggleError}</Text> : null}
          <Pressable style={styles.toggleButton} onPress={handleToggleActive} disabled={toggling}>
            {toggling ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.toggleButtonText}>{promotion.active ? 'Desactivar promoción' : 'Activar promoción'}</Text>
            )}
          </Pressable>
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

  productLine: { ...typography.callout, color: colors.textSecondary, marginBottom: spacing.lg },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow,
  },
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  fieldHalf: { flex: 1 },
  label: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.xs },
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
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.xs },

  previewBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: radii.md },
  previewTitle: { ...typography.subhead, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  previewLabel: { ...typography.callout, color: colors.textSecondary },
  previewValue: { ...typography.callout, fontWeight: '600', color: colors.textPrimary },

  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  toggleCard: {
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
});
