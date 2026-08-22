import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as dispatchApi from '../../src/modules/dispatch/api';
import { openInMaps } from '../../src/shared/openInMaps';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function DriverDispatchScreen() {
  const { token } = useAuth();
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDispatches(await dispatchApi.listMine(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los dispatches');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept(id) {
    setActingId(id);
    setError('');
    try {
      const updated = await dispatchApi.acceptDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setError(err.message || 'No se pudo aceptar el dispatch');
    } finally {
      setActingId(null);
    }
  }

  async function handleComplete(id) {
    setActingId(id);
    setError('');
    try {
      const updated = await dispatchApi.completeDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setError(err.message || 'No se pudo completar el dispatch');
    } finally {
      setActingId(null);
    }
  }

  const active = dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED');
  const past = dispatches.filter((d) => d.status === 'COMPLETED' || d.status === 'CANCELLED');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={active.length > 0 ? `Dispatch (${active.length} activo${active.length > 1 ? 's' : ''})` : 'Dispatch'}
        backHref="/driver"
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Activos</Text>
          {active.length === 0 ? (
            <Text style={styles.empty}>No tienes dispatches activos.</Text>
          ) : (
            active.map((d) => (
              <View key={d._id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.label}>{d.destinationLabel}</Text>
                  <Text style={[styles.status, { color: DISPATCH_STATUS_COLORS[d.status] }]}>
                    {DISPATCH_STATUS_LABELS[d.status]}
                  </Text>
                </View>
                <Text style={styles.address}>{d.address}</Text>
                {d.note ? <Text style={styles.note}>Nota: {d.note}</Text> : null}

                <Pressable style={styles.mapsButton} onPress={() => openInMaps(d.mapsUrl)}>
                  <Text style={styles.mapsButtonText}>Abrir en mapas</Text>
                </Pressable>

                {d.status === 'PENDING' && (
                  <Pressable style={styles.actionButton} onPress={() => handleAccept(d._id)} disabled={actingId === d._id}>
                    {actingId === d._id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Aceptar</Text>}
                  </Pressable>
                )}
                {d.status === 'ACCEPTED' && (
                  <Pressable
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => handleComplete(d._id)}
                    disabled={actingId === d._id}
                  >
                    {actingId === d._id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Marcar completado</Text>}
                  </Pressable>
                )}
              </View>
            ))
          )}

          {past.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Historial</Text>
              {past.map((d) => (
                <View key={d._id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Text style={styles.label}>{d.destinationLabel}</Text>
                    <Text style={[styles.status, { color: DISPATCH_STATUS_COLORS[d.status] }]}>
                      {DISPATCH_STATUS_LABELS[d.status]}
                    </Text>
                  </View>
                  <Text style={styles.address}>{d.address}</Text>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  status: { fontSize: 13, fontWeight: '700' },
  address: { fontSize: 13, color: '#666', marginTop: 2 },
  note: { fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' },
  mapsButton: { marginTop: 10, borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  mapsButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  actionButton: { marginTop: 8, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  completeButton: { backgroundColor: '#16a34a' },
  actionButtonText: { color: '#fff', fontWeight: '600' },
});
