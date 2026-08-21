import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as workShiftsApi from './api';
import { formatDurationMs } from '../../shared/duration';

export default function WorkStatusCard({ token, onShiftChange }) {
  const [shift, setShift] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workShiftsApi.getMyActiveShift(token);
      setShift(data);
      onShiftChange?.(data);
    } catch (err) {
      setShift(null);
      onShiftChange?.(null);
    } finally {
      setLoading(false);
    }
  }, [token, onShiftChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!shift) return undefined;
    setNow(Date.now()); // shift may have just started/loaded — don't wait for the first tick
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [shift]);

  async function handleStart() {
    setError('');
    setBusy(true);
    try {
      const data = await workShiftsApi.startShift(token);
      setShift(data);
      onShiftChange?.(data);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar el turno');
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    setError('');
    setBusy(true);
    try {
      await workShiftsApi.endShift(token);
      setShift(null);
      onShiftChange?.(null);
    } catch (err) {
      setError(err.message || 'No se pudo finalizar el turno');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.card, styles.cardIdle]}>
        <ActivityIndicator />
      </View>
    );
  }

  const elapsedMs = shift ? Math.max(0, now - new Date(shift.startedAt).getTime()) : 0;

  return (
    <View style={[styles.card, shift ? styles.cardActive : styles.cardIdle]}>
      {shift ? (
        <>
          <Text style={styles.statusTitle}>Turno activo</Text>
          <Text style={styles.statusLine}>Vehículo: {shift.vehicle?.name}</Text>
          <Text style={styles.statusLine}>Inicio: {new Date(shift.startedAt).toLocaleTimeString()}</Text>
          <Text style={styles.elapsed}>{formatDurationMs(elapsedMs)} transcurridas</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.endButton} onPress={handleEnd} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Finalizar turno</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.statusTitleIdle}>Turno no iniciado</Text>
          <Text style={styles.statusLineIdle}>Inicia tu turno para poder vender y operar inventario.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.startButton} onPress={handleStart} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Iniciar turno</Text>}
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  cardActive: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#16a34a' },
  cardIdle: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e5e5e5' },
  statusTitle: { fontSize: 18, fontWeight: '700', color: '#16a34a', marginBottom: 6 },
  statusTitleIdle: { fontSize: 18, fontWeight: '700', color: '#444', marginBottom: 6 },
  statusLine: { fontSize: 13, color: '#333', marginBottom: 2 },
  statusLineIdle: { fontSize: 13, color: '#666', marginBottom: 10 },
  elapsed: { fontSize: 15, fontWeight: '600', color: '#166534', marginTop: 4, marginBottom: 10 },
  error: { color: '#dc2626', fontSize: 12, marginBottom: 8 },
  startButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  endButton: { backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
