import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as productsApi from '../../src/modules/products/api';
import * as promotionsApi from '../../src/modules/promotions/api';
import * as salesApi from '../../src/modules/sales/api';
import { useWorkShift } from '../../src/modules/workShifts/useWorkShift';
import ProductCard from '../../src/modules/sales/ProductCard';
import PaymentModeSelector from '../../src/modules/sales/PaymentModeSelector';
import { calculateLineSubtotal } from '../../src/shared/pricing';
import { round2, formatCurrency } from '../../src/shared/money';
import { resolveFinalTotal, computeAdjustment, buildAutoPayments, computeMixedRemainder } from '../../src/shared/saleTotals';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography } from '../../src/shared/theme';

export default function NewSaleScreen() {
  const { token } = useAuth();
  const router = useRouter();

  // Shared with the driver home screen: the single source of truth for shift state, which
  // self-revalidates on every app foreground instead of the one-time fetch this screen used to
  // do on its own — so a shift that closed while this screen was backgrounded is never trusted.
  const { shift, loading: shiftLoading, loadError: shiftLoadError, reload: reloadShift } = useWorkShift(token);

  const [products, setProducts] = useState([]);
  const [promotionsByProduct, setPromotionsByProduct] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [quantities, setQuantities] = useState({});
  const [paymentMode, setPaymentMode] = useState('CASH');
  // The final total is a single concept the driver edits once, independent of payment mode —
  // not something re-derived per payment method the way it used to be for CASH only.
  const [finalTotalInput, setFinalTotalInput] = useState('');
  const [finalTotalTouched, setFinalTotalTouched] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [mixedCashInput, setMixedCashInput] = useState('');
  const [mixedTransferInput, setMixedTransferInput] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const [productsData, promotionsData] = await Promise.all([
        productsApi.listProducts(token),
        promotionsApi.listPromotions(token, { active: true }),
      ]);
      setProducts(productsData.filter((product) => product.active));
      const byProduct = {};
      promotionsData.forEach((promo) => {
        byProduct[promo.product._id] = { quantity: promo.quantity, bundlePrice: promo.bundlePrice };
      });
      setPromotionsByProduct(byProduct);
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los productos');
    } finally {
      setLoading(false);
    }
  }

  // Applies a +1/-1 delta against the latest state via the functional updater, rather than
  // computing "current + 1" from the outer closure — so rapid taps always accumulate correctly
  // instead of racing each other to the same stale value.
  function changeQuantity(productId, delta) {
    setQuantities((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] || 0) + delta) }));
  }

  const items = products
    .map((product) => ({
      product,
      quantity: quantities[product._id] || 0,
      promotion: promotionsByProduct[product._id],
    }))
    .filter((item) => item.quantity > 0);

  const subtotal = useMemo(
    () => round2(items.reduce((sum, item) => sum + calculateLineSubtotal(item.product.basePrice, item.quantity, item.promotion), 0)),
    [items]
  );

  useEffect(() => {
    if (!finalTotalTouched) {
      setFinalTotalInput(subtotal > 0 ? String(subtotal) : '');
    }
  }, [subtotal, finalTotalTouched]);

  // "Calculated total" (subtotal, from products) vs "final total" (what the driver actually
  // charged) — any difference is a monetary adjustment only, always editable regardless of the
  // selected payment method. It never touches inventory, which is driven purely by item
  // quantities (see items/subtotal above).
  const finalTotal = resolveFinalTotal(finalTotalInput, subtotal);
  const { amount: adjustmentValue, needsReason } = computeAdjustment(finalTotal, subtotal);
  const reasonOk = !needsReason || adjustmentReason.trim().length > 0;

  const mixedCashValue = round2(Number(mixedCashInput) || 0);
  const mixedTransferValue = round2(Number(mixedTransferInput) || 0);
  const mixedSum = round2(mixedCashValue + mixedTransferValue);
  const mixedMatches = mixedSum === finalTotal;

  // The app does the split math, not the driver: editing one MIXED field auto-fills the other
  // with the remainder needed to reach the final total. The driver can still overwrite it after.
  function handleMixedTransferChange(text) {
    setMixedTransferInput(text);
    const remainder = computeMixedRemainder(finalTotal, round2(Number(text) || 0));
    if (remainder !== null) setMixedCashInput(remainder === 0 ? '' : String(remainder));
  }
  function handleMixedCashChange(text) {
    setMixedCashInput(text);
    const remainder = computeMixedRemainder(finalTotal, round2(Number(text) || 0));
    if (remainder !== null) setMixedTransferInput(remainder === 0 ? '' : String(remainder));
  }

  const canSubmit =
    !!shift &&
    items.length > 0 &&
    subtotal > 0 &&
    finalTotal > 0 &&
    reasonOk &&
    !submitting &&
    (paymentMode === 'MIXED' ? mixedMatches && mixedSum > 0 : true);

  function resetCart() {
    setQuantities({});
    setPaymentMode('CASH');
    setFinalTotalInput('');
    setFinalTotalTouched(false);
    setAdjustmentReason('');
    setMixedCashInput('');
    setMixedTransferInput('');
  }

  async function handleSubmit() {
    setError('');
    setSuccessMessage('');
    setSubmitting(true);
    try {
      const adjustment = { amount: adjustmentValue, reason: adjustmentValue !== 0 ? adjustmentReason.trim() : '' };
      const autoPayments = buildAutoPayments(paymentMode, finalTotal);
      let payments = autoPayments || [];
      if (!autoPayments) {
        if (mixedCashValue > 0) payments.push({ method: 'cash', amount: mixedCashValue });
        if (mixedTransferValue > 0) payments.push({ method: 'transfer', amount: mixedTransferValue });
      }

      await salesApi.createSale(token, {
        items: items.map((item) => ({ product: item.product._id, quantity: item.quantity })),
        adjustment,
        payments,
      });

      setSuccessMessage('Venta registrada. A la espera de revisión del manager.');
      resetCart();
    } catch (err) {
      setError(err.message || 'No se pudo registrar la venta');
      // The backend is the single source of truth for shift state — if this failed because the
      // shift is no longer active (closed while this screen was open), don't leave stale UI
      // that still claims selling is allowed. Revalidate immediately so the screen switches to
      // the correct "sin turno" state on its own, with no manual refresh needed.
      reloadShift();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || shiftLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Nueva venta" backHref="/driver" />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  // The shift fetch itself failed — not the same as a confirmed "no active shift". Offer a
  // retry instead of blocking the driver on a possibly-wrong read.
  if (!shift && shiftLoadError) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Nueva venta" backHref="/driver" />
        </View>
        <View style={styles.blockedCenter}>
          <Text style={styles.blockedIcon}>⚠️</Text>
          <Text style={styles.blockedTitle}>No pudimos confirmar tu turno</Text>
          <Text style={styles.blockedBody}>{shiftLoadError}</Text>
          <Pressable style={styles.blockedButton} onPress={reloadShift}>
            <Text style={styles.blockedButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Blocked BEFORE the driver can build a cart at all — not discovered after filling one out.
  // Selling only ever depends on having an active shift; inventory belongs to the driver and
  // is never a prerequisite to sell.
  if (!shift) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Nueva venta" backHref="/driver" />
        </View>
        <View style={styles.blockedCenter}>
          <Text style={styles.blockedIcon}>⏳</Text>
          <Text style={styles.blockedTitle}>Todavía no puedes vender</Text>
          <Text style={styles.blockedBody}>Inicia tu turno desde el panel principal antes de registrar una venta.</Text>
          <Pressable style={styles.blockedButton} onPress={() => router.push('/driver')}>
            <Text style={styles.blockedButtonText}>Volver al panel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ScreenHeader title="Nueva venta" backHref="/driver" />

        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

        <View style={styles.grid}>
          {products.map((product) => (
            <ProductCard
              key={product._id}
              product={product}
              quantity={quantities[product._id] || 0}
              promotion={promotionsByProduct[product._id]}
              onIncrement={() => changeQuantity(product._id, 1)}
              onDecrement={() => changeQuantity(product._id, -1)}
            />
          ))}
        </View>

        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalCalculatedLabel}>Total calculado</Text>
            <Text style={styles.totalCalculatedValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total final</Text>
            {/* Always editable — independent of payment method. Explicit border/background so
                it unmistakably reads as an input, not a label, on every screen size. */}
            <TextInput
              style={styles.totalInput}
              keyboardType="numeric"
              editable
              value={finalTotalInput}
              onChangeText={(text) => {
                setFinalTotalTouched(true);
                setFinalTotalInput(text);
              }}
              placeholder={String(subtotal)}
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <Text style={styles.totalInputHint}>Toca para ajustar el monto cobrado</Text>

          {needsReason && (
            <View style={styles.adjustmentBox}>
              <Text style={styles.adjustmentLine}>
                Ajuste: {adjustmentValue > 0 ? '+' : ''}
                {formatCurrency(adjustmentValue)}
              </Text>
              <TextInput
                style={styles.input}
                value={adjustmentReason}
                onChangeText={setAdjustmentReason}
                placeholder='Ej. "Debía $30 anteriores"'
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Pago</Text>
        <PaymentModeSelector value={paymentMode} onChange={setPaymentMode} />

        {paymentMode === 'CASH' && (
          <View style={styles.paymentDetail}>
            <View style={styles.paymentSummaryRow}>
              <Text style={styles.label}>Efectivo</Text>
              <Text style={styles.paymentSummaryValue}>{formatCurrency(finalTotal)}</Text>
            </View>
          </View>
        )}

        {paymentMode === 'TRANSFER' && (
          <View style={styles.paymentDetail}>
            <View style={styles.paymentSummaryRow}>
              <Text style={styles.label}>Transferencia</Text>
              <Text style={styles.paymentSummaryValue}>{formatCurrency(finalTotal)}</Text>
            </View>
          </View>
        )}

        {paymentMode === 'MIXED' && (
          <View style={styles.paymentDetail}>
            <Text style={styles.label}>Transferencia</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={mixedTransferInput}
              onChangeText={handleMixedTransferChange}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={styles.label}>Efectivo</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={mixedCashInput}
              onChangeText={handleMixedCashChange}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
            />
            <Text style={[styles.mixedSumLine, !mixedMatches && mixedSum > 0 && styles.mixedSumMismatch]}>
              Suma: {formatCurrency(mixedSum)} / {formatCurrency(finalTotal)}
            </Text>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

        <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Registrar venta</Text>}
        </Pressable>

        <Pressable style={styles.linkButton} onPress={() => router.push('/driver/my-sales')}>
          <Text style={styles.linkText}>Ver mis ventas</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, marginBottom: spacing.sm, ...typography.callout },
  success: { color: colors.success, marginBottom: spacing.sm, ...typography.callout },

  blockedCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  blockedIcon: { fontSize: 40, marginBottom: spacing.md },
  blockedTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  blockedBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  blockedButton: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  blockedButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  totalBox: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalCalculatedLabel: { ...typography.subhead, color: colors.textSecondary },
  totalCalculatedValue: { ...typography.headline, color: colors.textSecondary },
  totalLabel: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.sm },
  totalInput: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'right',
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
  },
  totalInputHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'right', marginTop: 2 },
  adjustmentBox: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  adjustmentLine: { ...typography.subhead, color: colors.warning, fontWeight: '700', marginBottom: spacing.xs },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  paymentDetail: { marginTop: spacing.md },
  paymentSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentSummaryValue: { ...typography.headline, color: colors.textPrimary },
  label: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  mixedSumLine: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.sm },
  mixedSumMismatch: { color: colors.danger, fontWeight: '700' },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  linkButton: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
