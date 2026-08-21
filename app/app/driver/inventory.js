import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import * as closingApi from '../../src/modules/closing/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';
import { formatCurrency } from '../../src/shared/money';
import { SESSION_STATUS_LABELS } from '../../src/shared/constants';

export default function DriverInventoryScreen() {
  const { token } = useAuth();

  const [session, setSession] = useState(null);
  const [expected, setExpected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mode, setMode] = useState('idle'); // idle | partial | closing
  const [partialQuantities, setPartialQuantities] = useState({});
  const [partialResult, setPartialResult] = useState(null);
  const [partialSubmitting, setPartialSubmitting] = useState(false);
  const [partialError, setPartialError] = useState('');

  const [closingQuantities, setClosingQuantities] = useState({});
  const [reportedCash, setReportedCash] = useState('');
  const [closingResult, setClosingResult] = useState(null);
  const [closingDifferences, setClosingDifferences] = useState([]);
  const [closingSubmitting, setClosingSubmitting] = useState(false);
  const [closingError, setClosingError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const sessionData = await inventoryApi.getMyActiveSession(token);
      setSession(sessionData);
      const expectedData = await inventoryApi.getExpectedInventory(token, sessionData._id);
      setExpected(expectedData);
    } catch (err) {
      setSession(null);
      setLoadError(err.message || 'No hay una sesión de inventario abierta para tu vehículo');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function startPartial() {
    setMode('partial');
    setPartialResult(null);
    setPartialError('');
    const initial = {};
    expected.forEach((e) => {
      initial[e.product._id] = 0;
    });
    setPartialQuantities(initial);
  }

  function startClosing() {
    setMode('closing');
    setClosingResult(null);
    setClosingError('');
    const initial = {};
    expected.forEach((e) => {
      initial[e.product._id] = 0;
    });
    setClosingQuantities(initial);
    setReportedCash('');
  }

  async function submitPartial() {
    setPartialError('');
    setPartialSubmitting(true);
    try {
      const counts = expected.map((e) => ({
        product: e.product._id,
        quantityCounted: partialQuantities[e.product._id] || 0,
      }));
      const result = await inventoryCountsApi.createPartialCount(token, counts);
      setPartialResult(result);
      await load();
    } catch (err) {
      setPartialError(err.message || 'No se pudo registrar el conteo');
    } finally {
      setPartialSubmitting(false);
    }
  }

  async function submitClosing() {
    setClosingError('');
    const cash = Number(reportedCash);
    if (!Number.isFinite(cash) || cash < 0) {
      setClosingError('Indica el efectivo reportado (>= 0)');
      return;
    }
    setClosingSubmitting(true);
    try {
      const counts = expected.map((e) => ({
        product: e.product._id,
        quantityCounted: closingQuantities[e.product._id] || 0,
      }));
      const result = await closingApi.createClosing(token, counts, cash);
      setClosingResult(result);
      const countDetail = await inventoryCountsApi.getCount(token, result.inventoryCount._id);
      setClosingDifferences(countDetail.differences || []);
    } catch (err) {
      setClosingError(err.message || 'No se pudo registrar el cierre');
    } finally {
      setClosingSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
        <Pressable onPress={load} style={{ marginTop: 12 }}>
          <Text style={styles.refresh}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        <Pressable onPress={load}>
          <Text style={styles.refresh}>Actualizar</Text>
        </Pressable>
      </View>

      <View style={styles.sessionBox}>
        <Text style={styles.sessionLine}>
          Sesión {SESSION_STATUS_LABELS[session.status]} — {new Date(session.businessDate).toLocaleDateString()}
        </Text>
        <Text style={styles.sessionLine}>Vehículo: {session.vehicle?.name}</Text>
      </View>

      <Text style={styles.sectionTitle}>Inventario esperado</Text>
      {expected.map((e) => (
        <View key={e.product._id} style={styles.expectedRow}>
          <Text style={styles.expectedName}>
            {e.product.icon} {e.product.name}
          </Text>
          <Text style={styles.expectedQty}>{e.quantityExpected}</Text>
        </View>
      ))}

      {session.status === 'OPEN' && (
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionButton} onPress={startPartial}>
            <Text style={styles.actionButtonText}>Conteo parcial</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.closingButton]} onPress={startClosing}>
            <Text style={styles.actionButtonText}>Cerrar jornada</Text>
          </Pressable>
        </View>
      )}

      {mode === 'partial' && (
        <View style={styles.formBox}>
          <Text style={styles.sectionTitle}>Conteo parcial — cantidad física</Text>
          <QuantityStepper
            items={expected.map((e) => ({ product: e.product, note: `Esperado: ${e.quantityExpected}` }))}
            quantities={partialQuantities}
            onChangeQuantity={(id, qty) => setPartialQuantities((prev) => ({ ...prev, [id]: qty }))}
          />
          {partialError ? <Text style={styles.error}>{partialError}</Text> : null}
          <Pressable style={styles.button} onPress={submitPartial} disabled={partialSubmitting}>
            {partialSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar conteo</Text>}
          </Pressable>

          {partialResult && (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Diferencias</Text>
              {partialResult.differences.map((d) => (
                <View key={d.product._id} style={styles.diffRow}>
                  <Text style={styles.diffName}>{d.product.name}</Text>
                  <Text style={styles.diffValue}>
                    contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                    {d.difference})
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {mode === 'closing' && (
        <View style={styles.formBox}>
          <Text style={styles.sectionTitle}>Cierre de jornada — inventario final</Text>
          <QuantityStepper
            items={expected.map((e) => ({ product: e.product, note: `Esperado: ${e.quantityExpected}` }))}
            quantities={closingQuantities}
            onChangeQuantity={(id, qty) => setClosingQuantities((prev) => ({ ...prev, [id]: qty }))}
          />

          <Text style={styles.sectionTitle}>Efectivo en mano</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="0"
            value={reportedCash}
            onChangeText={setReportedCash}
          />

          {closingError ? <Text style={styles.error}>{closingError}</Text> : null}
          <Pressable style={styles.button} onPress={submitClosing} disabled={closingSubmitting}>
            {closingSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar cierre</Text>}
          </Pressable>

          {closingResult && (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Resumen de cierre</Text>
              <SummaryRow label="Efectivo esperado" value={formatCurrency(closingResult.expectedCash)} />
              <SummaryRow label="Efectivo reportado" value={formatCurrency(closingResult.reportedCash)} />
              <SummaryRow label="Diferencia" value={formatCurrency(closingResult.cashDifference)} bold />
              <Text style={[styles.resultTitle, { marginTop: 12 }]}>Diferencias de inventario</Text>
              {closingDifferences.map((d) => (
                <View key={d.product._id} style={styles.diffRow}>
                  <Text style={styles.diffName}>{d.product.name}</Text>
                  <Text style={styles.diffValue}>
                    contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                    {d.difference})
                  </Text>
                </View>
              ))}
              <Text style={styles.note}>
                Cierre registrado. Queda pendiente de revisión y finalización por el manager.
              </Text>
            </View>
          )}
        </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  refresh: { color: '#2563eb', fontSize: 14 },
  sessionBox: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 16 },
  sessionLine: { fontSize: 13, color: '#333', marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  expectedName: { fontSize: 14, color: '#333' },
  expectedQty: { fontSize: 14, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  actionButton: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  closingButton: { backgroundColor: '#16a34a' },
  actionButtonText: { color: '#fff', fontWeight: '600' },
  formBox: { marginTop: 20, padding: 12, backgroundColor: '#f9fafb', borderRadius: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 8 },
  resultBox: { marginTop: 16, padding: 12, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e5e5' },
  resultTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  diffRow: { marginBottom: 6 },
  diffName: { fontSize: 13, fontWeight: '600' },
  diffValue: { fontSize: 12, color: '#666' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 14, color: '#333' },
  summaryValue: { fontSize: 14, color: '#333' },
  bold: { fontWeight: '700', fontSize: 16 },
  note: { fontSize: 12, color: '#666', marginTop: 12, fontStyle: 'italic' },
});
