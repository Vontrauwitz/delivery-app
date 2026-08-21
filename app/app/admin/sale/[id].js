import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/modules/auth/useAuth';
import * as productsApi from '../../../src/modules/products/api';
import * as salesApi from '../../../src/modules/sales/api';
import * as approvalsApi from '../../../src/modules/approvals/api';
import * as auditApi from '../../../src/modules/audit/api';
import ProductPicker from '../../../src/modules/sales/ProductPicker';
import PaymentSplitInput from '../../../src/modules/sales/PaymentSplitInput';
import { round2, formatCurrency } from '../../../src/shared/money';
import { SALE_STATUS_LABELS, SALE_STATUS_COLORS } from '../../../src/shared/constants';

const EDITABLE_STATUSES = ['PENDING', 'INCIDENT'];

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

  const [quantities, setQuantities] = useState({});
  const [adjustmentAmount, setAdjustmentAmount] = useState('0');
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
    setAdjustmentAmount(String(saleData.adjustment?.amount ?? 0));
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
  const adjustmentValue = round2(Number(adjustmentAmount) || 0);
  const totalFinal = round2(subtotal + adjustmentValue);
  const cashValue = round2(Number(cashAmount) || 0);
  const transferValue = round2(Number(transferAmount) || 0);
  const paymentsSum = round2(cashValue + transferValue);
  const paymentsMatch = paymentsSum === totalFinal;
  const needsReason = adjustmentValue !== 0;
  const reasonOk = !needsReason || adjustmentReason.trim().length > 0;

  const isEditable = sale && EDITABLE_STATUSES.includes(sale.status);
  const canSave = isEditable && items.length > 0 && totalFinal > 0 && paymentsMatch && reasonOk && !saving;

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
        adjustment: { amount: adjustmentValue, reason: adjustmentReason.trim() },
        payments,
      });
      setSale(updated);
      applySaleToForm(updated);
      setBanner('Cambios guardados.');
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
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || 'Venta no encontrada'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Volver</Text>
      </Pressable>

      <Text style={styles.title}>Detalle de venta</Text>
      <Text style={[styles.status, { color: SALE_STATUS_COLORS[sale.status] }]}>
        {SALE_STATUS_LABELS[sale.status]}
      </Text>

      <View style={styles.metaBox}>
        <Text style={styles.metaLine}>
          Creada por: {sale.createdBy?.name} ({sale.createdBy?.email})
        </Text>
        <Text style={styles.metaLine}>Fecha de creación: {new Date(sale.createdAt).toLocaleString()}</Text>
        {sale.approval?.approvedAt && (
          <Text style={styles.metaLine}>
            Aprobada por: {sale.approval.approvedBy?.name} el {new Date(sale.approval.approvedAt).toLocaleString()}
          </Text>
        )}
        {sale.cancellation?.cancelledAt && (
          <Text style={styles.metaLine}>Cancelada — motivo: {sale.cancellation.reason}</Text>
        )}
        {sale.incident?.markedAt && <Text style={styles.metaLine}>Incidente — nota: {sale.incident.note}</Text>}
      </View>

      {banner ? <Text style={styles.success}>{banner}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!isEditable && (
        <Text style={styles.readonlyNote}>
          Esta venta está en estado {SALE_STATUS_LABELS[sale.status]} y ya no puede modificarse.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Productos</Text>
      <ProductPicker
        products={products}
        quantities={quantities}
        onChangeQuantity={isEditable ? handleChangeQuantity : () => {}}
      />

      <Text style={styles.sectionTitle}>Ajuste</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        editable={isEditable}
        value={adjustmentAmount}
        onChangeText={setAdjustmentAmount}
      />
      <TextInput
        style={styles.input}
        editable={isEditable}
        placeholder={needsReason ? 'Motivo del ajuste (obligatorio)' : 'Motivo del ajuste'}
        value={adjustmentReason}
        onChangeText={setAdjustmentReason}
      />

      <Text style={styles.sectionTitle}>Pago</Text>
      <PaymentSplitInput
        cashAmount={cashAmount}
        transferAmount={transferAmount}
        onChangeCash={setCashAmount}
        onChangeTransfer={setTransferAmount}
        editable={isEditable}
      />

      <View style={styles.summary}>
        <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
        <SummaryRow label="Ajuste" value={formatCurrency(adjustmentValue)} />
        <SummaryRow label="Total" value={formatCurrency(totalFinal)} bold />
        <SummaryRow label="Suma de pagos" value={formatCurrency(paymentsSum)} />
        {!paymentsMatch && <Text style={styles.warning}>La suma de los pagos debe ser igual al total.</Text>}
      </View>

      {isEditable && (
        <Pressable style={[styles.button, !canSave && styles.buttonDisabled]} onPress={handleSave} disabled={!canSave}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar cambios</Text>}
        </Pressable>
      )}

      {isEditable && (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.actionButton, styles.approveButton]}
            onPress={handleApprove}
            disabled={actionSubmitting}
          >
            <Text style={styles.actionButtonText}>Aprobar</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.cancelButton]}
            onPress={() => setActionMode(actionMode === 'cancel' ? 'idle' : 'cancel')}
            disabled={actionSubmitting}
          >
            <Text style={styles.actionButtonText}>Cancelar</Text>
          </Pressable>
          {sale.status === 'PENDING' && (
            <Pressable
              style={[styles.actionButton, styles.incidentButton]}
              onPress={() => setActionMode(actionMode === 'incident' ? 'idle' : 'incident')}
              disabled={actionSubmitting}
            >
              <Text style={styles.actionButtonText}>Marcar incidente</Text>
            </Pressable>
          )}
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
          />
          <Pressable style={styles.button} onPress={handleConfirmCancel} disabled={actionSubmitting}>
            {actionSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Confirmar cancelación</Text>
            )}
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
          />
          <Pressable style={styles.button} onPress={handleConfirmIncident} disabled={actionSubmitting}>
            {actionSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Confirmar incidente</Text>
            )}
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>Historial de cambios</Text>
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
    </ScrollView>
  );
}

function SummaryRow({ label, value, bold }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { color: '#2563eb', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  status: { fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  metaBox: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12 },
  metaLine: { fontSize: 13, color: '#333', marginBottom: 2 },
  readonlyNote: { color: '#666', fontStyle: 'italic', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  summary: { marginTop: 8, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 14, color: '#333' },
  summaryValue: { fontSize: 14, color: '#333' },
  bold: { fontWeight: '700', fontSize: 16 },
  warning: { color: '#dc2626', marginTop: 6, fontSize: 13 },
  error: { color: '#dc2626', marginBottom: 8 },
  success: { color: '#16a34a', marginBottom: 8 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionButton: { flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  approveButton: { backgroundColor: '#16a34a' },
  cancelButton: { backgroundColor: '#6b7280' },
  incidentButton: { backgroundColor: '#dc2626' },
  actionButtonText: { color: '#fff', fontWeight: '600' },
  reasonBox: { marginTop: 12, padding: 12, backgroundColor: '#fef2f2', borderRadius: 10 },
  empty: { color: '#666' },
  auditEntry: { borderTopWidth: 1, borderTopColor: '#eee', paddingVertical: 8 },
  auditAction: { fontSize: 13, fontWeight: '600', color: '#333' },
  auditChange: { fontSize: 12, color: '#666', marginLeft: 8 },
});
