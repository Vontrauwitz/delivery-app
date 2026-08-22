import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';
import { SESSION_STATUS_LABELS, COUNT_TYPE_LABELS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function InventoryOverviewScreen() {
  const { session: sessionIdParam } = useLocalSearchParams();
  const { token } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(sessionIdParam || null);
  const [session, setSession] = useState(null);
  const [expected, setExpected] = useState([]);
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingStock, setEditingStock] = useState(false);
  const [stockDraft, setStockDraft] = useState({});
  const [savingStock, setSavingStock] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await inventoryApi.listSessions(token);
      setSessions(data);
      if (!sessionId && data.length > 0) {
        setSessionId(data[0]._id);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las sesiones');
    }
  }, [token, sessionId]);

  const loadSessionDetail = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [sessionData, expectedData, countsData] = await Promise.all([
        inventoryApi.getSession(token, sessionId),
        inventoryApi.getExpectedInventory(token, sessionId),
        inventoryCountsApi.listCountsBySession(token, sessionId),
      ]);
      setSession(sessionData);
      setExpected(expectedData);
      setCounts(countsData);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la sesión');
    } finally {
      setLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadSessionDetail();
  }, [loadSessionDetail]);

  function startEditStock() {
    const draft = {};
    session.initialStock.forEach((s) => {
      draft[s.product._id] = s.quantity;
    });
    setStockDraft(draft);
    setEditingStock(true);
  }

  async function saveStock() {
    setSavingStock(true);
    setError('');
    try {
      const payload = session.initialStock.map((s) => ({
        product: s.product._id,
        quantity: stockDraft[s.product._id] ?? s.quantity,
      }));
      await inventoryApi.updateInitialStock(token, session._id, payload);
      setEditingStock(false);
      await loadSessionDetail();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el stock inicial');
    } finally {
      setSavingStock(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Inventario"
        backHref="/admin"
        onRefresh={() => {
          loadSessions();
          loadSessionDetail();
        }}
        refreshing={loading}
      />
      <Pressable style={styles.openSessionLink} onPress={() => router.push('/admin/inventory-open')}>
        <Text style={styles.link}>+ Abrir sesión</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Sesiones</Text>
      <View style={styles.sessionRow}>
        {sessions.map((s) => (
          <Pressable
            key={s._id}
            style={[styles.sessionChip, s._id === sessionId && styles.sessionChipActive]}
            onPress={() => setSessionId(s._id)}
          >
            <Text style={[styles.sessionChipText, s._id === sessionId && styles.sessionChipTextActive]}>
              {s.vehicle?.name} · {new Date(s.businessDate).toLocaleDateString()} · {SESSION_STATUS_LABELS[s.status]}
            </Text>
          </Pressable>
        ))}
      </View>
      {sessions.length === 0 && <Text style={styles.empty}>No hay sesiones registradas todavía.</Text>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : session ? (
        <>
          <View style={styles.detailBox}>
            <Text style={styles.detailLine}>Vehículo: {session.vehicle?.name}</Text>
            <Text style={styles.detailLine}>Chofer: {session.driver?.name}</Text>
            <Text style={styles.detailLine}>Estado: {SESSION_STATUS_LABELS[session.status]}</Text>
            <Text style={styles.detailLine}>Fecha: {new Date(session.businessDate).toLocaleDateString()}</Text>
            <Text style={styles.detailLine}>Inicio: {new Date(session.startedAt).toLocaleString()}</Text>
            {session.endedAt && <Text style={styles.detailLine}>Fin: {new Date(session.endedAt).toLocaleString()}</Text>}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Stock inicial</Text>
            {session.status === 'OPEN' && !editingStock && (
              <Pressable onPress={startEditStock}>
                <Text style={styles.link}>Editar</Text>
              </Pressable>
            )}
          </View>

          {editingStock ? (
            <View>
              <QuantityStepper
                items={session.initialStock.map((s) => ({ product: s.product }))}
                quantities={stockDraft}
                onChangeQuantity={(id, qty) => setStockDraft((prev) => ({ ...prev, [id]: qty }))}
              />
              <View style={styles.actionsRow}>
                <Pressable style={styles.button} onPress={saveStock} disabled={savingStock}>
                  {savingStock ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar</Text>}
                </Pressable>
                <Pressable style={styles.buttonSecondary} onPress={() => setEditingStock(false)}>
                  <Text style={styles.buttonSecondaryText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            session.initialStock.map((s) => (
              <View key={s.product._id} style={styles.row}>
                <Text style={styles.rowName}>
                  {s.product.icon} {s.product.name}
                </Text>
                <Text style={styles.rowValue}>{s.quantity}</Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Inventario esperado</Text>
          {expected.map((e) => (
            <View key={e.product._id} style={styles.row}>
              <Text style={styles.rowName}>
                {e.product.icon} {e.product.name}
              </Text>
              <Text style={styles.rowValue}>{e.quantityExpected}</Text>
            </View>
          ))}

          <Text style={styles.sectionTitle}>Conteos registrados</Text>
          {counts.length === 0 ? (
            <Text style={styles.empty}>Sin conteos todavía.</Text>
          ) : (
            counts.map((c) => (
              <View key={c._id} style={styles.countCard}>
                <Text style={styles.countHeader}>
                  {COUNT_TYPE_LABELS[c.type]} — {c.driver?.name} — {new Date(c.createdAt).toLocaleString()}
                </Text>
                {c.differences.map((d) => (
                  <View key={d.product._id} style={styles.diffRow}>
                    <Text style={styles.diffName}>{d.product.name}</Text>
                    <Text style={styles.diffValue}>
                      contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                      {d.difference})
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </>
      ) : (
        <Text style={styles.empty}>
          {sessions.length === 0
            ? 'Todavía no hay sesiones de inventario. Abre una para empezar.'
            : 'Selecciona una sesión arriba para ver el detalle.'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  openSessionLink: { alignSelf: 'flex-start', marginBottom: 16 },
  link: { color: '#2563eb', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  sessionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sessionChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  sessionChipActive: { backgroundColor: '#2563eb' },
  sessionChipText: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  sessionChipTextActive: { color: '#fff' },
  empty: { color: '#666', marginTop: 8 },
  error: { color: '#dc2626', marginTop: 8 },
  detailBox: { marginTop: 16, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12 },
  detailLine: { fontSize: 13, color: '#333', marginBottom: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowName: { fontSize: 14, color: '#333' },
  rowValue: { fontSize: 14, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  button: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonSecondary: { flex: 1, borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonSecondaryText: { color: '#2563eb', fontWeight: '600' },
  countCard: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  countHeader: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  diffRow: { marginBottom: 4 },
  diffName: { fontSize: 13, fontWeight: '600' },
  diffValue: { fontSize: 12, color: '#666' },
});
