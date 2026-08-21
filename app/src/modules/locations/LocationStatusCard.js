import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as locationsApi from './api';
import { formatDurationMs } from '../../shared/duration';

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('La geolocalización no está disponible en este dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err.message || 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

export default function LocationStatusCard({ token }) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await locationsApi.getMyLocation(token);
      setLocation(data);
    } catch (err) {
      setLocation(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleShare() {
    setError('');
    setSending(true);
    try {
      const coords = await getCurrentPosition();
      const updated = await locationsApi.recordLocation(token, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      });
      setLocation({ ...updated, isStale: false });
      setNow(Date.now());
    } catch (err) {
      setError(err.message || 'No se pudo compartir la ubicación');
    } finally {
      setSending(false);
    }
  }

  const ageMs = location ? Math.max(0, now - new Date(location.serverTimestamp).getTime()) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Ubicación</Text>
      {loading ? (
        <ActivityIndicator />
      ) : location ? (
        <>
          <Text style={[styles.status, location.isStale && styles.statusStale]}>
            {location.isStale ? 'Desactualizada' : 'Actualizada'}
          </Text>
          <Text style={styles.line}>Última actualización: hace {formatDurationMs(ageMs)}</Text>
        </>
      ) : (
        <Text style={styles.line}>Aún no has compartido tu ubicación.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={handleShare} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Compartir ubicación</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, padding: 16, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  status: { fontSize: 14, fontWeight: '600', color: '#16a34a', marginBottom: 2 },
  statusStale: { color: '#d97706' },
  line: { fontSize: 13, color: '#666', marginBottom: 10 },
  error: { color: '#dc2626', fontSize: 12, marginBottom: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
