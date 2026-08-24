import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as workShiftsApi from '../../src/modules/workShifts/api';
import { formatDurationMs } from '../../src/shared/duration';
import { getOpenSinceLabel } from '../../src/shared/shiftComparison';
import { SHIFT_STATUS_LABELS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';

function toLocalInputValue(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ShiftsScreen() {
  const { token } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');

  const [startedAtInput, setStartedAtInput] = useState('');
  const [endedAtInput, setEndedAtInput] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await workShiftsApi.listShifts(token);
      setShifts(data);
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los turnos');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = shifts.find((s) => s._id === selectedId);

  function selectShift(shift) {
    if (selectedId === shift._id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(shift._id);
    setStartedAtInput(toLocalInputValue(shift.startedAt));
    setEndedAtInput(toLocalInputValue(shift.endedAt));
    setReason('');
    setError('');
  }

  async function handleSaveCorrection() {
    if (!reason.trim()) {
      setError('El motivo de la corrección es obligatorio');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await workShiftsApi.adminEditShift(token, selectedId, {
        startedAt: startedAtInput ? new Date(startedAtInput).toISOString() : undefined,
        endedAt: endedAtInput ? new Date(endedAtInput).toISOString() : null,
        reason: reason.trim(),
      });
      setReason('');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo corregir el turno');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdminClose() {
    if (!reason.trim()) {
      setError('El motivo es obligatorio para cerrar un turno olvidado');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await workShiftsApi.adminCloseShift(token, selectedId, {
        endedAt: endedAtInput ? new Date(endedAtInput).toISOString() : undefined,
        reason: reason.trim(),
      });
      setReason('');
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar el turno');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Turnos" backHref="/admin" onRefresh={load} refreshing={loading} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : shifts.length === 0 && !loadError ? (
        <Text style={styles.empty}>No hay turnos registrados. Aparecerán aquí cuando un chofer inicie uno.</Text>
      ) : (
        shifts.map((shift) => (
          <Pressable
            key={shift._id}
            style={[styles.card, shift._id === selectedId && styles.cardActive]}
            onPress={() => selectShift(shift)}
          >
            <View style={styles.cardRow}>
              <Text style={styles.driver}>
                {shift.driver?.name} — {shift.vehicle?.name}
              </Text>
              <Text style={[styles.status, shift.status === 'OPEN' && styles.statusOpen]}>
                {SHIFT_STATUS_LABELS[shift.status]}
              </Text>
            </View>
            <Text style={styles.line}>Inicio: {new Date(shift.startedAt).toLocaleString()}</Text>
            <Text style={styles.line}>
              Fin: {shift.endedAt ? new Date(shift.endedAt).toLocaleString() : '—'}
            </Text>
            <Text style={styles.line}>
              {shift.status === 'OPEN' ? getOpenSinceLabel(shift.durationMs) : `Duración: ${formatDurationMs(shift.durationMs)}`}
            </Text>

            {shift._id === selectedId && (
              <View style={styles.detailBox}>
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Text style={styles.label}>Inicio (corregido)</Text>
                <TextInput
                  style={styles.input}
                  value={startedAtInput}
                  onChangeText={setStartedAtInput}
                  placeholder="AAAA-MM-DDTHH:MM"
                />

                <Text style={styles.label}>Fin (corregido, opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={endedAtInput}
                  onChangeText={setEndedAtInput}
                  placeholder="AAAA-MM-DDTHH:MM"
                />

                <Text style={styles.label}>Motivo (obligatorio)</Text>
                <TextInput
                  style={styles.input}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Motivo de la corrección"
                />

                <Pressable style={styles.button} onPress={handleSaveCorrection} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Guardar corrección</Text>}
                </Pressable>

                {shift.status === 'OPEN' && (
                  <Pressable style={[styles.button, styles.closeButton]} onPress={handleAdminClose} disabled={saving}>
                    <Text style={styles.buttonText}>Cerrar turno olvidado</Text>
                  </Pressable>
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
  empty: { color: '#666', marginTop: 20, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 12, marginBottom: 10 },
  cardActive: { borderColor: '#2563eb' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  driver: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  status: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  statusOpen: { color: '#16a34a' },
  line: { fontSize: 12, color: '#666' },
  detailBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  label: { fontSize: 13, color: '#444', marginBottom: 4, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  button: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  closeButton: { backgroundColor: '#dc2626' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#dc2626', marginBottom: 8, fontSize: 13 },
});
