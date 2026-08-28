import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

// Dispatch is a top-level operational tool reached directly from the dashboard (not nested under
// Configuración) — same "title + home icon" header as Mensajes and the dashboard itself.
function Header({ onHome }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>Dispatch</Text>
      <Pressable style={styles.iconButton} onPress={onHome} hitSlop={8}>
        <Ionicons name="home-outline" size={18} color={neoColors.ink} />
      </Pressable>
    </View>
  );
}

export default function AdminDispatchScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [destinationLabel, setDestinationLabel] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

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
    setLoadError('');
    try {
      setDispatches(await dispatchApi.listAll(token));
    } catch (err) {
      setLoadError(err.message || 'No se pudieron cargar los dispatches');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDrivers();
    loadDispatches();
  }, [loadDrivers, loadDispatches]);

  const canCreate = !!selectedDriverId && address.trim().length > 0 && !creating;

  async function handleCreate() {
    setError('');
    if (!selectedDriverId) {
      setError('Selecciona un chofer');
      return;
    }
    if (!address.trim()) {
      setError('La dirección es requerida');
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
    setCancellingId(id);
    setLoadError('');
    try {
      const updated = await dispatchApi.cancelDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setLoadError(err.message || 'No se pudo cancelar el dispatch');
    } finally {
      setCancellingId(null);
    }
  }

  const active = dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED');
  const past = dispatches.filter((d) => d.status === 'COMPLETED' || d.status === 'CANCELLED');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onHome={() => router.push('/admin')} />

      <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
        <Text style={styles.cardEyebrow}>Nuevo dispatch</Text>

        <Text style={styles.label}>Chofer</Text>
        <View style={styles.chipRow}>
          {drivers.map((d) => (
            <Pressable
              key={d._id}
              style={[styles.chip, d._id === selectedDriverId && styles.chipActive]}
              onPress={() => setSelectedDriverId(d._id)}
            >
              <Text style={[styles.chipText, d._id === selectedDriverId && styles.chipTextActive]}>{d.name}</Text>
            </Pressable>
          ))}
        </View>
        {drivers.length === 0 && <Text style={styles.empty}>No hay choferes registrados.</Text>}

        <Text style={styles.label}>Dirección</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Dirección completa"
          placeholderTextColor={neoColors.textTertiary}
        />

        <Text style={styles.label}>Cliente / referencia (opcional)</Text>
        <TextInput
          style={styles.input}
          value={destinationLabel}
          onChangeText={setDestinationLabel}
          placeholder="Ej. Bodega Norte"
          placeholderTextColor={neoColors.textTertiary}
        />

        <Text style={styles.label}>Instrucciones / nota (opcional)</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Ej. Tocar el timbre del lado izquierdo"
          placeholderTextColor={neoColors.textTertiary}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.createButton, !canCreate && styles.createButtonDisabled]} onPress={handleCreate} disabled={!canCreate}>
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Crear dispatch</Text>}
        </Pressable>
      </NeoCard>

      <Text style={styles.sectionTitle}>Activos</Text>
      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
      ) : active.length === 0 ? (
        <Text style={styles.empty}>No hay dispatches activos.</Text>
      ) : (
        active.map((d) => (
          <NeoCard key={d._id} accentColor={DISPATCH_STATUS_COLORS[d.status]} style={styles.cardWrap} contentStyle={styles.cardBody}>
            <View style={styles.dispatchHeaderRow}>
              <Text style={styles.dispatchLabel} numberOfLines={1}>
                {d.destinationLabel || d.address}
              </Text>
              <View style={[styles.statusPill, { backgroundColor: `${DISPATCH_STATUS_COLORS[d.status]}22` }]}>
                <Text style={[styles.statusPillText, { color: DISPATCH_STATUS_COLORS[d.status] }]}>{DISPATCH_STATUS_LABELS[d.status]}</Text>
              </View>
            </View>
            <Text style={styles.dispatchMeta}>
              {d.driver?.name} · {d.address}
            </Text>
            {d.note ? <Text style={styles.dispatchMeta}>Nota: {d.note}</Text> : null}
            <Pressable
              style={styles.cancelButton}
              onPress={() => handleCancel(d._id)}
              disabled={cancellingId === d._id}
              hitSlop={8}
            >
              {cancellingId === d._id ? (
                <ActivityIndicator color={neoColors.danger} size="small" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              )}
            </Pressable>
          </NeoCard>
        ))
      )}

      {past.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Historial</Text>
          {past.map((d) => (
            <NeoCard key={d._id} accentColor={DISPATCH_STATUS_COLORS[d.status]} style={styles.cardWrap} contentStyle={styles.cardBody}>
              <View style={styles.dispatchHeaderRow}>
                <Text style={styles.dispatchLabel} numberOfLines={1}>
                  {d.destinationLabel || d.address}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: `${DISPATCH_STATUS_COLORS[d.status]}22` }]}>
                  <Text style={[styles.statusPillText, { color: DISPATCH_STATUS_COLORS[d.status] }]}>{DISPATCH_STATUS_LABELS[d.status]}</Text>
                </View>
              </View>
              <Text style={styles.dispatchMeta}>
                {d.driver?.name} · {d.address}
              </Text>
              {d.note ? <Text style={styles.dispatchMeta}>Nota: {d.note}</Text> : null}
            </NeoCard>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: neoSpacing.lg },
  title: { ...neoTypography.title, color: neoColors.ink },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: neoRadii.md,
    borderWidth: 2,
    borderColor: neoColors.ink,
    backgroundColor: neoColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardEyebrow: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs },

  label: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs, marginTop: neoSpacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm },
  chip: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { color: neoColors.ink, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  input: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.md,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: neoColors.surface,
    color: neoColors.ink,
  },

  error: { color: neoColors.danger, fontWeight: '700', marginTop: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },

  createButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center', marginTop: neoSpacing.lg },
  createButtonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  sectionTitle: { ...neoTypography.title, fontSize: 18, color: neoColors.ink, marginBottom: neoSpacing.md },

  dispatchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: neoSpacing.xs },
  dispatchLabel: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flexShrink: 1 },
  dispatchMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },
  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  cancelButton: { alignSelf: 'flex-start', marginTop: neoSpacing.sm },
  cancelButtonText: { color: neoColors.danger, fontSize: 12, fontWeight: '700' },
});
