import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as vehiclesApi from '../../src/modules/vehicles/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import ScreenHeader from '../../src/shared/ScreenHeader';

function groupByVehicleAndWeek(counts) {
  const groups = new Map();
  for (const count of counts) {
    const key = `${count.vehicle?._id || count.vehicle}__${count.week}`;
    if (!groups.has(key)) {
      groups.set(key, { vehicle: count.vehicle, week: count.week, counts: [] });
    }
    groups.get(key).counts.push(count);
  }
  return Array.from(groups.values());
}

export default function WeeklyReportScreen() {
  const { token } = useAuth();

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('ALL');
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVehicles = useCallback(async () => {
    try {
      setVehicles(await vehiclesApi.listVehicles(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los vehículos');
    }
  }, [token]);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = selectedVehicleId !== 'ALL' ? { vehicle: selectedVehicleId } : {};
      setCounts(await inventoryCountsApi.listWeeklyCounts(token, params));
    } catch (err) {
      setError(err.message || 'No se pudo cargar el reporte');
    } finally {
      setLoading(false);
    }
  }, [token, selectedVehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const groups = groupByVehicleAndWeek(counts);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Reporte semanal" backHref="/admin" onRefresh={loadCounts} refreshing={loading} />

      <View style={styles.vehicleRow}>
        <Pressable
          style={[styles.vehicleChip, selectedVehicleId === 'ALL' && styles.vehicleChipActive]}
          onPress={() => setSelectedVehicleId('ALL')}
        >
          <Text style={[styles.vehicleChipText, selectedVehicleId === 'ALL' && styles.vehicleChipTextActive]}>Todos</Text>
        </Pressable>
        {vehicles.map((v) => (
          <Pressable
            key={v._id}
            style={[styles.vehicleChip, v._id === selectedVehicleId && styles.vehicleChipActive]}
            onPress={() => setSelectedVehicleId(v._id)}
          >
            <Text style={[styles.vehicleChipText, v._id === selectedVehicleId && styles.vehicleChipTextActive]}>
              {v.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>No hay conteos semanales registrados todavía.</Text>
      ) : (
        groups.map((group) => (
          <View key={`${group.vehicle?._id}-${group.week}`} style={styles.groupBox}>
            <Text style={styles.groupTitle}>
              {group.vehicle?.name} — semana {group.week}
            </Text>
            {group.counts.map((count) => (
              <View key={count._id} style={styles.countCard}>
                <Text style={styles.countMeta}>
                  {new Date(count.businessDate || count.createdAt).toLocaleDateString()} · registrado por{' '}
                  {count.createdBy?.name}
                </Text>
                {count.differences.map((d) => (
                  <View key={d.product._id} style={styles.diffRow}>
                    <Text style={styles.diffName}>
                      {d.product.icon} {d.product.name}
                    </Text>
                    <Text style={styles.diffMeta}>
                      esperado {d.quantityExpected} · contado {d.quantityCounted}
                    </Text>
                    <Text style={[styles.diffValue, d.difference !== 0 && styles.diffValueNonZero]}>
                      {d.difference >= 0 ? '+' : ''}
                      {d.difference}
                      {d.differencePercentage !== null
                        ? ` (${d.differencePercentage >= 0 ? '+' : ''}${d.differencePercentage}%)`
                        : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  vehicleChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  vehicleChipActive: { backgroundColor: '#2563eb' },
  vehicleChipText: { color: '#2563eb', fontWeight: '600' },
  vehicleChipTextActive: { color: '#fff' },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  groupBox: { marginBottom: 20 },
  groupTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  countCard: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 8 },
  countMeta: { fontSize: 12, color: '#666', marginBottom: 8 },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, flexWrap: 'wrap' },
  diffName: { fontSize: 13, fontWeight: '600', flex: 1 },
  diffMeta: { fontSize: 12, color: '#666', marginRight: 8 },
  diffValue: { fontSize: 13, fontWeight: '700', color: '#333' },
  diffValueNonZero: { color: '#dc2626' },
});
