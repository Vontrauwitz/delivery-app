import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as productsApi from '../../../src/modules/products/api';
import * as salesApi from '../../../src/modules/sales/api';
import * as approvalsApi from '../../../src/modules/approvals/api';
import * as auditApi from '../../../src/modules/audit/api';
import ProductCard from '../../../src/modules/sales/ProductCard';
import PaymentSplitInput from '../../../src/modules/sales/PaymentSplitInput';
import { round2, formatCurrency } from '../../../src/shared/money';
import { computeAdjustment } from '../../../src/shared/saleTotals';
import { SALE_STATUS_LABELS, SALE_STATUS_COLORS } from '../../../src/shared/constants';
import { colors, spacing, radii, typography, softShadow } from '../../../src/shared/theme';

const EDITABLE_STATUSES = ['PENDING', 'INCIDENT'];
const PAYMENT_METHOD_LABELS = { cash: 'Efectivo', transfer: 'Transferencia' };

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams();
  const { token } = useAuth();
  const router = useRouter();

  const [sale, setSale] = useState(null);
  const [products, setProducts] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // review = the clean receipt summary (default); edit = the full editable form. Mutually
  // exclusive on purpose — "Guardar cambios" and "Aprobar venta" never compete for attention.
  const [mode, setMode] = useState('review');
  const [historyOpen, setHistoryOpen] = useState(false);

  const [quantities, setQuantities] = useState({});
  const [finalTotalInput, setFinalTotalInput] = useState('0');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [cashAmount, setCashAmount] = useState('0');
  const [transferAmount, setTransferAmount] = useState('0');

  const [saving, setSaving] = useState(false);
  const [actionMode, setActionMode] = useState('idle'); // idle | cancel | incident
  const [reasonText, setReasonText] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const applySaleToForm = useCallback((saleData) => {
    const q = {};
    saleData.items.forEach((item) => {
      const productId = item.product?._id || item.product;
      q[productId] = item.quantity;
    });
    setQuantities(q);
    setFinalTotalInput(String(saleData.totalFinal ?? 0));
    setAdjustmentReason(saleData.adjustment?.reason ?? '');
    const cash = saleData.payments.find((p) => p.method === 'cash');
    const transfer = saleData.payments.find((p) => p.method === 'transfer');
    setCashAmount(String(cash?.amount ?? 0));
    setTransferAmount(String(transfer?.amount ?? 0));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [saleData, productsData, auditData] = await Promise.all([
        salesApi.getSale(token, id),
        productsApi.listProducts(token),
        auditApi.getAuditHistory(token, 'Sale', id),
      ]);
      setSale(saleData);
      setProducts(productsData);
      setAuditEntries(auditData);
      applySaleToForm(saleData);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la venta');
    } finally {
      setLoading(false);
    }
  }, [token, id, applySaleToForm]);

  useEffect(() => {
    load();
  }, [load]);

  function handleChangeQuantity(productId, quantity) {
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
  }

  const items = products
    .map((product) => ({ product, quantity: quantities[product._id] || 0 }))
    .filter((item) => item.quantity > 0);

  const subtotal = round2(items.reduce((sum, item) => sum + item.product.basePrice * item.quantity, 0));
  // Same "calculated total vs final total" model as the driver's POS screen — the manager edits
  // one final total, and the adjustment (with its required reason) is derived from it.
  const finalTotal = round2(Number(finalTotalInput) || 0);
  const { amount: adjustmentValue, needsReason } = computeAdjustment(finalTotal, subtotal);
  const cashValue = round2(Number(cashAmount) || 0);
  const transferValue = round2(Number(transferAmount) || 0);
  const paymentsSum = round2(cashValue + transferValue);
  const paymentsMatch = paymentsSum === finalTotal;
  const reasonOk = !needsReason || adjustmentReason.trim().length > 0;

  const isEditable = sale && EDITABLE_STATUSES.includes(sale.status);
  const canSave = isEditable && items.length > 0 && finalTotal > 0 && paymentsMatch && reasonOk && !saving;

  function startEdit() {
    applySaleToForm(sale);
    setBanner('');
    setError('');
    setActionMode('idle');
    setMode('edit');
  }

  function cancelEdit() {
    applySaleToForm(sale);
    setError('');
    setMode('review');
  }

  async function refreshAudit() {
    const auditData = await auditApi.getAuditHistory(token, 'Sale', id);
    setAuditEntries(auditData);
  }

  async function handleSave() {
    setBanner('');
    setError('');
    setSaving(true);
    try {
      const payments = [];
      if (cashValue > 0) payments.push({ method: 'cash', amount: cashValue });
      if (transferValue > 0) payments.push({ method: 'transfer', amount: transferValue });

      const updated = await approvalsApi.updateSale(token, id, {
        items: items.map((item) => ({ product: item.product._id, quantity: item.quantity })),
        adjustment: { amount: adjustmentValue, reason: adjustmentValue !== 0 ? adjustmentReason.trim() : '' },
        payments,
      });
      setSale(updated);
      applySaleToForm(updated);
      setBanner('Cambios guardados.');
      setMode('review');
      await refreshAudit();
    } catch (err) {
      setError(err.message || 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setBanner('');
    setError('');
    setActionSubmitting(true);
    try {
      const updated = await approvalsApi.approveSale(token, id);
      setSale(updated);
      applySaleToForm(updated);
      setBanner('Venta aprobada.');
      await refreshAudit();
    } catch (err) {
      setError(err.message || 'No se pudo aprobar la venta');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleConfirmCancel() {
    if (!reasonText.trim()) {
      setError('El motivo de cancelación es obligatorio');
      return;
    }
    setError('');
    setActionSubmitting(true);
    try {
      const updated = await approvalsApi.cancelSale(token, id, reasonText.trim());
      setSale(updated);
      applySaleToForm(updated);
      setBanner('Venta cancelada.');
      setActionMode('idle');
      setReasonText('');
      await refreshAudit();
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la venta');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleConfirmIncident() {
    if (!reasonText.trim()) {
      setError('La nota del incidente es obligatoria');
      return;
    }
    setError('');
    setActionSubmitting(true);
    try {
      const updated = await approvalsApi.markIncident(token, id, reasonText.trim());
      setSale(updated);
      applySaleToForm(updated);
      setBanner('Venta marcada como incidente.');
      setActionMode('idle');
      setReasonText('');
      await refreshAudit();
    } catch (err) {
      setError(err.message || 'No se pudo marcar el incidente');
    } finally {
      setActionSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back}>← Volver</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back}>← Volver</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.error}>{error || 'Venta no encontrada'}</Text>
        </View>
      </View>
    );
  }

  const adjustmentAmountOnSale = sale.adjustment?.amount || 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>← Volver</Text>
      </Pressable>

      <Text style={[styles.title, { color: SALE_STATUS_COLORS[sale.status] }]}>
        Venta {SALE_STATUS_LABELS[sale.status].toLowerCase()}
      </Text>
      <Text style={styles.driverName}>{sale.driver?.name}</Text>
      <Text style={styles.dateLine}>{new Date(sale.createdAt).toLocaleString()}</Text>

      {sale.status === 'APPROVED' && sale.approval?.approvedAt && (
        <Text style={styles.metaNote}>
          Aprobada por {sale.approval.approvedBy?.name} el {new Date(sale.approval.approvedAt).toLocaleString()}
        </Text>
      )}
      {sale.status === 'CANCELLED' && sale.cancellation && (
        <Text style={styles.metaNoteDanger}>Cancelada — motivo: {sale.cancellation.reason}</Text>
      )}
      {sale.status === 'INCIDENT' && sale.incident && (
        <Text style={styles.metaNoteWarning}>Incidente — nota: {sale.incident.note}</Text>
      )}

      {banner ? <Text style={styles.success}>{banner}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {mode === 'review' ? (
        <>
          <View style={styles.receiptCard}>
            <Text style={styles.sectionTitle}>Productos</Text>
            {sale.items.map((item, index) => (
              <View key={item.product?._id || item.product || index} style={styles.receiptRow}>
                <Text style={styles.receiptItemName}>
                  {item.product?.icon} {item.product?.name} ×{item.quantity}
                </Text>
                <Text style={styles.receiptItemValue}>{formatCurrency(item.subtotal)}</Text>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Subtotal</Text>
              <Text style={styles.receiptValue}>{formatCurrency(sale.subtotalOriginal)}</Text>
            </View>

            {adjustmentAmountOnSale !== 0 && (
              <>
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptLabel}>Ajuste</Text>
                  <Text style={[styles.receiptValue, styles.adjustmentValue]}>
                    {adjustmentAmountOnSale > 0 ? '+' : ''}
                    {formatCurrency(adjustmentAmountOnSale)}
                  </Text>
                </View>
                {sale.adjustment?.reason ? <Text style={styles.adjustmentReasonText}>"{sale.adjustment.reason}"</Text> : null}
              </>
            )}

            <View style={styles.divider} />

            <View style={styles.receiptRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValue}>{formatCurrency(sale.totalFinal)}</Text>
            </View>
          </View>

          <View style={styles.receiptCard}>
            <Text style={styles.sectionTitle}>Pago</Text>
            {sale.payments.map((p, idx) => (
              <View key={idx} style={styles.receiptRow}>
                <Text style={styles.receiptItemName}>{PAYMENT_METHOD_LABELS[p.method] || p.method}</Text>
                <Text style={styles.receiptItemValue}>{formatCurrency(p.amount)}</Text>
              </View>
            ))}
          </View>

          {isEditable ? (
            <Pressable style={styles.approveButton} onPress={handleApprove} disabled={actionSubmitting}>
              {actionSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveButtonText}>Aprobar venta</Text>}
            </Pressable>
          ) : (
            <Text style={styles.readonlyNote}>
              Esta venta está en estado {SALE_STATUS_LABELS[sale.status]} y ya no puede modificarse.
            </Text>
          )}

          {isEditable && (
            <View style={styles.quietActionsRow}>
              <Pressable onPress={startEdit} disabled={actionSubmitting} hitSlop={8}>
                <Text style={styles.quietAction}>Editar</Text>
              </Pressable>
              {sale.status === 'PENDING' && (
                <Pressable
                  onPress={() => setActionMode(actionMode === 'incident' ? 'idle' : 'incident')}
                  disabled={actionSubmitting}
                  hitSlop={8}
                >
                  <Text style={styles.quietAction}>Incidente</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setActionMode(actionMode === 'cancel' ? 'idle' : 'cancel')}
                disabled={actionSubmitting}
                hitSlop={8}
              >
                <Text style={styles.quietActionDanger}>Cancelar</Text>
              </Pressable>
            </View>
          )}

          {actionMode === 'cancel' && (
            <View style={styles.reasonBox}>
              <Text style={styles.sectionTitle}>Motivo de cancelación</Text>
              <TextInput
                style={styles.input}
                value={reasonText}
                onChangeText={setReasonText}
                placeholder="Motivo (obligatorio)"
                placeholderTextColor={colors.textTertiary}
              />
              <Pressable style={styles.reasonButton} onPress={handleConfirmCancel} disabled={actionSubmitting}>
                {actionSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.reasonButtonText}>Confirmar cancelación</Text>}
              </Pressable>
            </View>
          )}

          {actionMode === 'incident' && (
            <View style={styles.reasonBox}>
              <Text style={styles.sectionTitle}>Nota del incidente</Text>
              <TextInput
                style={styles.input}
                value={reasonText}
                onChangeText={setReasonText}
                placeholder="Nota (obligatoria)"
                placeholderTextColor={colors.textTertiary}
              />
              <Pressable style={styles.reasonButton} onPress={handleConfirmIncident} disabled={actionSubmitting}>
                {actionSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.reasonButtonText}>Confirmar incidente</Text>}
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <View style={styles.editCard}>
          <View style={styles.editHeaderRow}>
            <Text style={styles.sectionTitle}>Editando venta</Text>
            <Pressable onPress={cancelEdit} hitSlop={8}>
              <Text style={styles.quietAction}>Cancelar edición</Text>
            </Pressable>
          </View>

          <Text style={styles.editSubsectionTitle}>Productos</Text>
          <View style={styles.pickerGrid}>
            {products.map((product) => {
              const productQuantity = quantities[product._id] || 0;
              return (
                <ProductCard
                  key={product._id}
                  product={product}
                  quantity={productQuantity}
                  style={styles.pickerCard}
                  onIncrement={() => handleChangeQuantity(product._id, productQuantity + 1)}
                  onDecrement={() => handleChangeQuantity(product._id, Math.max(0, productQuantity - 1))}
                />
              );
            })}
          </View>

          <Text style={styles.editSubsectionTitle}>En la venta</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyCart}>Toca un producto para agregarlo</Text>
          ) : (
            <View style={styles.cartCard}>
              {items.map((item, index) => (
                <View key={item.product._id} style={[styles.cartRow, index === items.length - 1 && styles.cartRowLast]}>
                  <Text style={styles.cartIcon}>{item.product.icon || '📦'}</Text>
                  <View style={styles.cartMain}>
                    <View style={styles.cartTopLine}>
                      <Text style={styles.cartName} numberOfLines={1}>
                        {item.product.name}
                      </Text>
                      <Text style={styles.cartLineTotal}>{formatCurrency(item.product.basePrice * item.quantity)}</Text>
                    </View>
                    <View style={styles.cartBottomLine}>
                      <Text style={styles.cartUnitPrice}>{formatCurrency(item.product.basePrice)} c/u</Text>
                      <View style={styles.cartStepper}>
                        <Pressable
                          style={styles.cartStepperButton}
                          hitSlop={8}
                          onPress={() => handleChangeQuantity(item.product._id, Math.max(0, item.quantity - 1))}
                        >
                          <Text style={styles.cartStepperText}>−</Text>
                        </Pressable>
                        <Text style={styles.cartQty}>{item.quantity}</Text>
                        <Pressable
                          style={styles.cartStepperButton}
                          hitSlop={8}
                          onPress={() => handleChangeQuantity(item.product._id, item.quantity + 1)}
                        >
                          <Text style={styles.cartStepperText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalCalculatedLabel}>Total calculado</Text>
              <Text style={styles.totalCalculatedValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalFinalLabel}>Total final</Text>
              <TextInput
                style={styles.totalInput}
                keyboardType="numeric"
                value={finalTotalInput}
                onChangeText={setFinalTotalInput}
              />
            </View>
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
                  placeholder="Motivo del ajuste (obligatorio)"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            )}
          </View>

          <Text style={styles.editSubsectionTitle}>Pago</Text>
          <PaymentSplitInput
            cashAmount={cashAmount}
            transferAmount={transferAmount}
            onChangeCash={setCashAmount}
            onChangeTransfer={setTransferAmount}
          />
          {!paymentsMatch && <Text style={styles.warning}>La suma de los pagos debe ser igual al total final.</Text>}

          <Pressable style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
          </Pressable>
        </View>
      )}

      <Pressable style={styles.historyToggle} onPress={() => setHistoryOpen((v) => !v)} hitSlop={8}>
        <Text style={styles.historyToggleText}>{historyOpen ? 'Ocultar historial ▲' : 'Ver historial ▼'}</Text>
      </Pressable>
      {historyOpen && (
        <View style={styles.historyBox}>
          {auditEntries.length === 0 ? (
            <Text style={styles.empty}>Sin cambios registrados.</Text>
          ) : (
            auditEntries.map((entry) => (
              <View key={entry._id} style={styles.auditEntry}>
                <Text style={styles.auditAction}>
                  {entry.action} — {entry.performedBy?.name} — {new Date(entry.performedAt).toLocaleString()}
                </Text>
                {entry.changes?.map((change, idx) => (
                  <Text key={idx} style={styles.auditChange}>
                    {change.field}: {JSON.stringify(change.oldValue)} → {JSON.stringify(change.newValue)}
                  </Text>
                ))}
              </View>
            ))
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
  back: { color: colors.primary, marginBottom: spacing.md, fontWeight: '600' },

  title: { ...typography.title, marginTop: spacing.xs },
  driverName: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.xs },
  dateLine: { ...typography.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  metaNote: { ...typography.caption, color: colors.success, marginBottom: spacing.sm },
  metaNoteDanger: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
  metaNoteWarning: { ...typography.caption, color: colors.warning, marginBottom: spacing.sm },

  error: { color: colors.danger, marginBottom: spacing.sm },
  success: { color: colors.success, marginBottom: spacing.sm },

  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginBottom: spacing.sm },
  editSubsectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },

  receiptCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow,
  },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  receiptItemName: { ...typography.body, color: colors.textPrimary, flexShrink: 1, paddingRight: spacing.sm },
  receiptItemValue: { ...typography.body, color: colors.textPrimary },
  receiptLabel: { ...typography.callout, color: colors.textSecondary },
  receiptValue: { ...typography.callout, color: colors.textPrimary },
  adjustmentValue: { color: colors.warning, fontWeight: '700' },
  adjustmentReasonText: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  totalLabel: { ...typography.headline, color: colors.textPrimary },
  totalValue: { ...typography.largeTitle, color: colors.textPrimary },

  readonlyNote: { ...typography.callout, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.lg, textAlign: 'center' },

  approveButton: {
    backgroundColor: colors.success,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    ...softShadow,
  },
  approveButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },

  quietActionsRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.lg },
  quietAction: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  quietActionDanger: { color: colors.danger, fontSize: 14, fontWeight: '600' },

  reasonBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.dangerMuted, borderRadius: radii.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  reasonButton: { backgroundColor: colors.textPrimary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  reasonButtonText: { color: '#fff', fontWeight: '600' },

  editCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow,
  },
  editHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },

  // Responsive product-picker grid: each card has a minimum width (flexBasis) and grows to fill
  // leftover row space (flexGrow) up to a cap (maxWidth) — flexWrap naturally packs 2 columns on
  // a narrow phone or a Fold's cover screen, 3-4 on a Fold opened or a tablet, and more on a wide
  // web window, with no device-specific breakpoints.
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  pickerCard: { flexGrow: 1, flexBasis: 130, maxWidth: 200 },

  emptyCart: {
    ...typography.callout,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
  },
  cartCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cartRowLast: { borderBottomWidth: 0 },
  cartIcon: { fontSize: 28 },
  cartMain: { flex: 1 },
  cartTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, flexShrink: 1, paddingRight: spacing.sm },
  cartLineTotal: { ...typography.headline, color: colors.textPrimary },
  cartBottomLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  cartUnitPrice: { ...typography.caption, color: colors.textSecondary },
  cartStepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartStepperButton: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartStepperText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, lineHeight: 18 },
  cartQty: { ...typography.body, fontWeight: '600', color: colors.textPrimary, minWidth: 20, textAlign: 'center' },

  totalBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.background, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalCalculatedLabel: { ...typography.subhead, color: colors.textSecondary },
  totalCalculatedValue: { ...typography.headline, color: colors.textSecondary },
  totalFinalLabel: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.sm },
  totalInput: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'right',
    minWidth: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
  },
  adjustmentBox: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  adjustmentLine: { ...typography.subhead, color: colors.warning, fontWeight: '700', marginBottom: spacing.xs },

  warning: { color: colors.danger, marginTop: spacing.xs, fontSize: 13 },

  saveButton: { backgroundColor: colors.primary, borderRadius: radii.lg, paddingVertical: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  historyToggle: { marginTop: spacing.xxl, alignItems: 'center' },
  historyToggleText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  historyBox: { marginTop: spacing.sm },
  empty: { color: colors.textSecondary },
  auditEntry: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm },
  auditAction: { ...typography.caption, fontWeight: '600', color: colors.textPrimary },
  auditChange: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
});
