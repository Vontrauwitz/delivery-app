import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as vehiclesApi from '../../src/modules/vehicles/api';
import * as productsApi from '../../src/modules/products/api';
import * as inventoryCountsApi from '../../src/modules/inventoryCounts/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';

export default function WeeklyCountScreen() {
  const { token } = useAuth();

  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vehiclesData, productsData] = await Promise.all([vehiclesApi.listVehicles(token), productsApi.listProducts(token)]);
      setVehicles(vehiclesData);
      setProducts(productsData.filter((p) => p.active));
      if (vehiclesData.length > 0) {
        setSelectedVehicleId((current) => current || vehiclesData[0]._id);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function selectVehicle(id) {
    setSelectedVehicleId(id);
    setResult(null);
    setQuantities({});
  }

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      const counts = products.map((p) => ({ product: p._id, quantityCounted: quantities[p._id] || 0 }));
      const count = await inventoryCountsApi.createWeeklyCount(token, {
        vehicle: selectedVehicleId,
        counts,
        weekOf: new Date().toISOString(),
      });
      setResult(count);
      setQuantities({});
    } catch (err) {
      setError(err.message || 'No se pudo registrar el conteo semanal');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Conteo semanal</Text>

      <Text style={styles.sectionTitle}>Vehículo</Text>
      <View style={styles.vehicleRow}>
        {vehicles.map((v) => (
          <Pressable
            key={v._id}
            style={[styles.vehicleChip, v._id === selectedVehicleId && styles.vehicleChipActive]}
            onPress={() => selectVehicle(v._id)}
          >
            <Text style={[styles.vehicleChipText, v._id === selectedVehicleId && styles.vehicleChipTextActive]}>
              {v.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {vehicles.length === 0 && <Text style={styles.empty}>No hay vehículos registrados.</Text>}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Cantidad física contada</Text>
      <QuantityStepper
        items={products.map((p) => ({ product: p }))}
        quantities={quantities}
        onChangeQuantity={(id, qty) => setQuantities((prev) => ({ ...prev, [id]: qty }))}
      />

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting || !selectedVehicleId}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Registrar conteo semanal</Text>}
      </Pressable>

      {result && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Diferencias</Text>
          {result.differences.map((d) => (
            <View key={d.product._id} style={styles.diffRow}>
              <Text style={styles.diffName}>
                {d.product.icon} {d.product.name}
              </Text>
              <Text style={styles.diffValue}>
                contado {d.quantityCounted} / esperado {d.quantityExpected} ({d.difference >= 0 ? '+' : ''}
                {d.difference}
                {d.differencePercentage !== null ? `, ${d.differencePercentage >= 0 ? '+' : ''}${d.differencePercentage}%` : ''})
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  vehicleChipActive: { backgroundColor: '#2563eb' },
  vehicleChipText: { color: '#2563eb', fontWeight: '600' },
  vehicleChipTextActive: { color: '#fff' },
  empty: { color: '#666', marginTop: 8 },
  error: { color: '#dc2626', marginBottom: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  resultBox: { marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10 },
  resultTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  diffRow: { marginBottom: 6 },
  diffName: { fontSize: 13, fontWeight: '600' },
  diffValue: { fontSize: 12, color: '#666' },
});
