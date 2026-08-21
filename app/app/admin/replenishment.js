import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as vehiclesApi from '../../src/modules/vehicles/api';
import * as replenishmentApi from '../../src/modules/replenishment/api';

export default function ReplenishmentScreen() {
  const { token } = useAuth();

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editingProductId, setEditingProductId] = useState(null);
  const [coverageDaysInput, setCoverageDaysInput] = useState('');
  const [safetyStockInput, setSafetyStockInput] = useState('');
  const [saving, setSaving] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      const data = await vehiclesApi.listVehicles(token);
      setVehicles(data);
      if (data.length > 0) {
        setSelectedVehicleId((current) => current || data[0]._id);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los vehículos');
    }
  }, [token]);

  const loadSuggestions = useCallback(async () => {
    if (!selectedVehicleId) return;
    setLoading(true);
    setError('');
    try {
      const data = await replenishmentApi.getSuggestions(token, selectedVehicleId);
      setSuggestions(data);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las sugerencias');
    } finally {
      setLoading(false);
    }
  }, [token, selectedVehicleId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  function startEdit(row) {
    setEditingProductId(row.product._id);
    setCoverageDaysInput(String(row.coverageDays));
    setSafetyStockInput(String(row.safetyStock));
  }

  async function saveConfig(productId) {
    setSaving(true);
    setError('');
    try {
      await replenishmentApi.setConfig(token, productId, {
        coverageDays: Number(coverageDaysInput),
        safetyStock: Number(safetyStockInput),
      });
      setEditingProductId(null);
      await loadSuggestions();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  }

  async function resetConfig(productId) {
    setSaving(true);
    setError('');
    try {
      await replenishmentApi.resetConfig(token, productId);
      setEditingProductId(null);
      await loadSuggestions();
    } catch (err) {
      setError(err.message || 'No se pudo restablecer la configuración');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Reabastecimiento</Text>
        <Pressable onPress={loadSuggestions}>
          <Text style={styles.refresh}>Actualizar</Text>
        </Pressable>
      </View>

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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : suggestions ? (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoLine}>
              Basado en {suggestions.sessionsUsed} sesión(es) cerrada(s) · Stock actual desde:{' '}
              {suggestions.stockSource === 'ACTIVE_SESSION'
                ? 'sesión activa'
                : suggestions.stockSource === 'LAST_CLOSED_SESSION'
                ? 'último cierre'
                : 'sin datos'}
            </Text>
            {suggestions.insufficientHistory && (
              <Text style={styles.warning}>
                Historial insuficiente (menos de 3 sesiones cerradas). Los promedios pueden no ser representativos
                todavía.
              </Text>
            )}
          </View>

          {suggestions.rows.length === 0 ? (
            <Text style={styles.empty}>No hay productos activos.</Text>
          ) : (
            suggestions.rows.map((row) => (
              <View key={row.product._id} style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.productName}>
                    {row.product.icon} {row.product.name}
                  </Text>
                  <Pressable onPress={() => (editingProductId === row.product._id ? setEditingProductId(null) : startEdit(row))}>
                    <Text style={styles.link}>{editingProductId === row.product._id ? 'Cerrar' : 'Configurar'}</Text>
                  </Pressable>
                </View>

                <Metric label="Stock actual" value={row.currentStock} />
                <Metric label="Consumo diario promedio" value={row.averageDailyConsumption} />
                <Metric label="Días de cobertura" value={row.coverageDays} muted={!row.configIsOverride} />
                <Metric label="Stock de seguridad" value={row.safetyStock} muted={!row.configIsOverride} />
                <Metric label="Stock objetivo" value={row.targetStock} />
                <View style={styles.suggestedRow}>
                  <Text style={styles.suggestedLabel}>Cantidad sugerida a cargar</Text>
                  <Text style={styles.suggestedValue}>{row.suggestedReplenishment}</Text>
                </View>

                {editingProductId === row.product._id && (
                  <View style={styles.editBox}>
                    <Text style={styles.label}>Días de cobertura</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={coverageDaysInput}
                      onChangeText={setCoverageDaysInput}
                    />
                    <Text style={styles.label}>Stock de seguridad</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={safetyStockInput}
                      onChangeText={setSafetyStockInput}
                    />
                    <View style={styles.editActions}>
                      <Pressable style={styles.saveButton} onPress={() => saveConfig(row.product._id)} disabled={saving}>
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar</Text>}
                      </Pressable>
                      {row.configIsOverride && (
                        <Pressable style={styles.resetButton} onPress={() => resetConfig(row.product._id)} disabled={saving}>
                          <Text style={styles.buttonText}>Usar valores por defecto</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value, muted }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, muted && styles.metricValueMuted]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold' },
  refresh: { color: '#2563eb', fontSize: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  vehicleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  vehicleChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  vehicleChipActive: { backgroundColor: '#2563eb' },
  vehicleChipText: { color: '#2563eb', fontWeight: '600' },
  vehicleChipTextActive: { color: '#fff' },
  error: { color: '#dc2626', marginBottom: 8 },
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  infoBox: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 12 },
  infoLine: { fontSize: 12, color: '#333' },
  warning: { color: '#d97706', fontSize: 12, marginTop: 6, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  productName: { fontSize: 16, fontWeight: '600' },
  link: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  metricLabel: { fontSize: 13, color: '#666' },
  metricValue: { fontSize: 13, color: '#333', fontWeight: '600' },
  metricValueMuted: { color: '#999', fontWeight: '400' },
  suggestedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  suggestedLabel: { fontSize: 14, fontWeight: '700' },
  suggestedValue: { fontSize: 18, fontWeight: '800', color: '#2563eb' },
  editBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  label: { fontSize: 13, color: '#444', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    fontSize: 14,
  },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  saveButton: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  resetButton: { flex: 1, backgroundColor: '#6b7280', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
