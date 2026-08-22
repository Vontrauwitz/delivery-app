import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as vehiclesApi from '../../src/modules/vehicles/api';
import * as productsApi from '../../src/modules/products/api';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as workShiftsApi from '../../src/modules/workShifts/api';
import QuantityStepper from '../../src/modules/inventory/QuantityStepper';
import ScreenHeader from '../../src/shared/ScreenHeader';

export default function InventoryOpenScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [openSessionForVehicle, setOpenSessionForVehicle] = useState(null);
  const [driverHasOpenShift, setDriverHasOpenShift] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [initialStock, setInitialStock] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vehiclesData, productsData] = await Promise.all([
        vehiclesApi.listVehicles(token),
        productsApi.listProducts(token),
      ]);
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

  const checkOpenSession = useCallback(
    async (vehicleId) => {
      if (!vehicleId) return;
      try {
        // A vehicle isn't free for a new session until its current one is fully CLOSED —
        // OPEN and CLOSING_PENDING both count as "active" here.
        const sessions = await inventoryApi.listSessions(token, { vehicle: vehicleId });
        setOpenSessionForVehicle(sessions.find((s) => s.status !== 'CLOSED') || null);
      } catch (err) {
        setOpenSessionForVehicle(null);
      }
    },
    [token]
  );

  useEffect(() => {
    if (selectedVehicleId) {
      checkOpenSession(selectedVehicleId);
      const initial = {};
      products.forEach((p) => {
        initial[p._id] = 0;
      });
      setInitialStock(initial);
    }
  }, [selectedVehicleId, products, checkOpenSession]);

  useEffect(() => {
    const vehicle = vehicles.find((v) => v._id === selectedVehicleId);
    const driverId = vehicle?.assignedDriver?._id;
    if (!driverId) {
      setDriverHasOpenShift(true);
      return;
    }
    workShiftsApi
      .listShifts(token, { driver: driverId, status: 'OPEN' })
      .then((shifts) => setDriverHasOpenShift(shifts.length > 0))
      .catch(() => setDriverHasOpenShift(true));
  }, [selectedVehicleId, vehicles, token]);

  async function handleOpen() {
    setError('');
    setSubmitting(true);
    try {
      const stockPayload = products
        .map((p) => ({ product: p._id, quantity: initialStock[p._id] || 0 }))
        .filter((s) => s.quantity > 0);

      if (stockPayload.length === 0) {
        setError('Indica el stock inicial de al menos un producto');
        setSubmitting(false);
        return;
      }

      const session = await inventoryApi.openSession(token, {
        vehicle: selectedVehicleId,
        initialStock: stockPayload,
      });
      router.push(`/admin/inventory?session=${session._id}`);
    } catch (err) {
      setError(err.message || 'No se pudo abrir la sesión');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <ScreenHeader title="Abrir sesión de inventario" backHref="/admin/inventory" />
        </View>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  const selectedVehicle = vehicles.find((v) => v._id === selectedVehicleId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Abrir sesión de inventario" backHref="/admin/inventory" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionTitle}>Vehículo</Text>
      <View style={styles.vehicleRow}>
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
      {vehicles.length === 0 && <Text style={styles.empty}>No hay vehículos registrados.</Text>}

      {selectedVehicle && !selectedVehicle.assignedDriver && (
        <Text style={styles.warning}>Este vehículo no tiene chofer asignado. No se podrá abrir una sesión.</Text>
      )}
      {selectedVehicle?.assignedDriver && !driverHasOpenShift && (
        <Text style={styles.warning}>
          {selectedVehicle.assignedDriver.name} no tiene un turno de trabajo abierto. Debe iniciar turno antes de abrir la sesión.
        </Text>
      )}

      {openSessionForVehicle ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Ya existe una sesión activa para este vehículo.</Text>
          <Pressable onPress={() => router.push(`/admin/inventory?session=${openSessionForVehicle._id}`)}>
            <Text style={styles.link}>Ver sesión →</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Stock inicial</Text>
          <QuantityStepper
            items={products.map((p) => ({ product: p }))}
            quantities={initialStock}
            onChangeQuantity={(id, qty) => setInitialStock((prev) => ({ ...prev, [id]: qty }))}
          />

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleOpen}
            disabled={submitting || !selectedVehicle?.assignedDriver || !driverHasOpenShift}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Abrir sesión</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleChip: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  vehicleChipActive: { backgroundColor: '#2563eb' },
  vehicleChipText: { color: '#2563eb', fontWeight: '600' },
  vehicleChipTextActive: { color: '#fff' },
  empty: { color: '#666', marginTop: 8 },
  warning: { color: '#dc2626', marginTop: 12, fontSize: 13 },
  infoBox: { marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 10 },
  infoText: { color: '#333', marginBottom: 8 },
  link: { color: '#2563eb', fontWeight: '600' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 8 },
});
