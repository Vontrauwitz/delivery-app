import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';

export default function AdminDispatchScreen() {
  const { token } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [destinationLabel, setDestinationLabel] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDrivers = useCallback(async () => {
    try {
      const users = await usersApi.listUsers(token);
      const driverUsers = users.filter((u) => u.role === 'driver');
      setDrivers(driverUsers);
      if (driverUsers.length > 0) {
        setSelectedDriverId((current) => current || driverUsers[0]._id);
      }
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los choferes');
    }
  }, [token]);

  const loadDispatches = useCallback(async () => {
    setLoading(true);
    try {
      setDispatches(await dispatchApi.listAll(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los dispatches');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDrivers();
    loadDispatches();
  }, [loadDrivers, loadDispatches]);

  async function handleCreate() {
    setError('');
    if (!selectedDriverId) {
      setError('Selecciona un chofer');
      return;
    }
    setCreating(true);
    try {
      await dispatchApi.createDispatch(token, {
        driver: selectedDriverId,
        destinationLabel: destinationLabel.trim(),
        address: address.trim(),
        note: note.trim(),
      });
      setDestinationLabel('');
      setAddress('');
      setNote('');
      await loadDispatches();
    } catch (err) {
      setError(err.message || 'No se pudo crear el dispatch');
    } finally {
      setCreating(false);
    }
  }

  async function handleCancel(id) {
    setError('');
    try {
      const updated = await dispatchApi.cancelDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setError(err.message || 'No se pudo cancelar el dispatch');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dispatch</Text>

      <Text style={styles.sectionTitle}>Nuevo dispatch</Text>
      <Text style={styles.label}>Chofer</Text>
      <View style={styles.driverRow}>
        {drivers.map((d) => (
          <Pressable
            key={d._id}
            style={[styles.driverChip, d._id === selectedDriverId && styles.driverChipActive]}
            onPress={() => setSelectedDriverId(d._id)}
          >
            <Text style={[styles.driverChipText, d._id === selectedDriverId && styles.driverChipTextActive]}>{d.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Etiqueta del destino</Text>
      <TextInput style={styles.input} value={destinationLabel} onChangeText={setDestinationLabel} placeholder="Ej. Bodega Norte" />

      <Text style={styles.label}>Dirección</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Dirección completa" />

      <Text style={styles.label}>Nota (opcional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Nota" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Crear dispatch</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Todos los dispatches</Text>
      {loading ? (
        <ActivityIndicator />
      ) : dispatches.length === 0 ? (
        <Text style={styles.empty}>No hay dispatches registrados.</Text>
      ) : (
        dispatches.map((d) => (
          <View key={d._id} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>{d.destinationLabel}</Text>
              <Text style={[styles.status, { color: DISPATCH_STATUS_COLORS[d.status] }]}>{DISPATCH_STATUS_LABELS[d.status]}</Text>
            </View>
            <Text style={styles.cardMeta}>
              {d.driver?.name} · {d.address}
            </Text>
            {d.note ? <Text style={styles.cardMeta}>Nota: {d.note}</Text> : null}
            {(d.status === 'PENDING' || d.status === 'ACCEPTED') && (
              <Pressable style={styles.cancelButton} onPress={() => handleCancel(d._id)}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
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
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  label: { fontSize: 13, color: '#444', marginBottom: 4, marginTop: 8 },
  driverRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  driverChip: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  driverChipActive: { backgroundColor: '#2563eb' },
  driverChipText: { color: '#2563eb', fontWeight: '600' },
  driverChipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  error: { color: '#dc2626', marginTop: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  empty: { color: '#666' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13, fontWeight: '700' },
  cardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  cancelButton: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  cancelButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
