import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as locationsApi from '../../src/modules/locations/api';
import { openInMaps } from '../../src/shared/openInMaps';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function DriversMapScreen() {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDrivers(await locationsApi.getCurrentLocations(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las ubicaciones');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Choferes activos" backHref="/admin" onRefresh={load} refreshing={loading} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : drivers.length === 0 ? (
        <Text style={styles.empty}>No hay choferes activos.</Text>
      ) : (
        drivers.map((d) => (
          <View key={d.driver._id} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.name}>{d.driver.name}</Text>
              {d.location && (
                <Text style={[styles.badge, d.isStale ? styles.badgeStale : styles.badgeFresh]}>
                  {d.isStale ? 'Desactualizada' : 'Actualizada'}
                </Text>
              )}
            </View>
            <Text style={styles.meta}>Vehículo: {d.vehicle?.name || 'Sin asignar'}</Text>
            {d.location ? (
              <>
                <Text style={styles.meta}>Última actualización: {new Date(d.location.serverTimestamp).toLocaleString()}</Text>
                <Pressable
                  style={styles.mapsButton}
                  onPress={() => openInMaps(`https://maps.google.com/?q=${d.location.latitude},${d.location.longitude}`)}
                >
                  <Text style={styles.mapsButtonText}>Abrir en mapas</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.meta}>Sin datos de ubicación todavía.</Text>
            )}
          </View>
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
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  badgeFresh: { color: '#16a34a', backgroundColor: '#dcfce7' },
  badgeStale: { color: '#d97706', backgroundColor: '#fef3c7' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  mapsButton: { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  mapsButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 12 },
});
