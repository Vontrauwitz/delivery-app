import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as closingApi from '../../src/modules/closing/api';
import { formatCurrency } from '../../src/shared/money';
import { CLOSING_STATUS_LABELS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';

const CLOSING_STATUS_COLORS = {
  OPEN: '#d97706',
  CLOSED: '#16a34a',
  REOPENED: '#dc2626',
};

export default function ClosingsScreen() {
  const { token } = useAuth();
  const [closings, setClosings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await closingApi.listClosings(token);
      setClosings(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los cierres');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = closings.find((c) => c._id === selectedId);

  async function handleFinalize() {
    setFinalizing(true);
    setError('');
    try {
      await closingApi.finalizeClosing(token, selectedId, note.trim());
      setNote('');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo finalizar el cierre');
    } finally {
      setFinalizing(false);
    }
  }

  async function handleReopen() {
    if (!reopenReason.trim()) {
      setError('El motivo de la reapertura es obligatorio');
      return;
    }
    setReopening(true);
    setError('');
    try {
      await closingApi.reopenClosing(token, selectedId, reopenReason.trim());
      setReopenReason('');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo reabrir el cierre');
    } finally {
      setReopening(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Cierres" backHref="/admin" onRefresh={load} refreshing={loading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : closings.length === 0 ? (
        <Text style={styles.empty}>No hay cierres registrados. Los cierres aparecen aquí cuando un chofer envía uno.</Text>
      ) : (
        closings.map((c) => (
          <Pressable
            key={c._id}
            style={[styles.card, c._id === selectedId && styles.cardActive]}
            onPress={() => setSelectedId(c._id === selectedId ? null : c._id)}
          >
            <View style={styles.cardRow}>
              <Text style={styles.driver}>
                {c.driver?.name} — {c.vehicle?.name}
              </Text>
              <Text style={[styles.status, CLOSING_STATUS_COLORS[c.status] && { color: CLOSING_STATUS_COLORS[c.status] }]}>
                {CLOSING_STATUS_LABELS[c.status]}
              </Text>
            </View>
            <Text style={styles.date}>{new Date(c.date).toLocaleDateString()}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cashLine}>Esperado: {formatCurrency(c.expectedCash)}</Text>
              <Text style={styles.cashLine}>Reportado: {formatCurrency(c.reportedCash)}</Text>
              <Text style={[styles.cashLine, c.cashDifference !== 0 && styles.cashDiffWarning]}>
                Dif: {formatCurrency(c.cashDifference)}
              </Text>
            </View>

            {c._id === selectedId && (
              <View style={styles.detailBox}>
                {c.managerNote ? <Text style={styles.noteText}>Nota: {c.managerNote}</Text> : null}
                {c.status === 'OPEN' && (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Observaciones (opcional)"
                      value={note}
                      onChangeText={setNote}
                    />
                    <Pressable style={styles.button} onPress={handleFinalize} disabled={finalizing || reopening}>
                      {finalizing ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Finalizar cierre</Text>
                      )}
                    </Pressable>

                    <Text style={styles.reopenHint}>
                      ¿El chofer se equivocó? Reabre el cierre para que pueda corregirlo. La sesión vuelve a OPEN.
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Motivo de la reapertura (obligatorio)"
                      value={reopenReason}
                      onChangeText={setReopenReason}
                    />
                    <Pressable style={[styles.button, styles.reopenButton]} onPress={handleReopen} disabled={finalizing || reopening}>
                      {reopening ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Reabrir cierre</Text>
                      )}
                    </Pressable>
                  </>
                )}
                {c.status === 'CLOSED' && (
                  <Text style={styles.finalizedText}>
                    Finalizado por {c.closedBy?.name} el {new Date(c.closedAt).toLocaleString()}
                  </Text>
                )}
                {c.status === 'REOPENED' && (
                  <Text style={styles.reopenedText}>
                    Reabierto por {c.reopenedBy?.name} el {new Date(c.reopenedAt).toLocaleString()} — motivo: {c.reopenReason}
                  </Text>
                )}
              </View>
            )}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardActive: { borderColor: '#2563eb' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 },
  driver: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '600', color: '#d97706' },
  date: { fontSize: 12, color: '#666', marginBottom: 4 },
  cashLine: { fontSize: 12, color: '#333' },
  cashDiffWarning: { color: '#dc2626', fontWeight: '700' },
  detailBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  noteText: { fontSize: 13, color: '#333', marginBottom: 8, fontStyle: 'italic' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  button: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  finalizedText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  reopenHint: { fontSize: 12, color: '#666', marginTop: 16, marginBottom: 6 },
  reopenButton: { backgroundColor: '#d97706' },
  reopenedText: { fontSize: 12, color: '#d97706', fontWeight: '600' },
});
