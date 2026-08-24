import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as scheduledShiftsApi from '../../src/modules/scheduledShifts/api';
import { formatDurationMs } from '../../src/shared/duration';
import { getHeadlineLabel, getStatusColor, formatSignedDuration } from '../../src/shared/shiftComparison';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRange(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  const timeFmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayFmt = (d) => d.toLocaleDateString([], { weekday: 'short' });
  if (s.toDateString() === e.toDateString()) {
    return `${timeFmt(s)}–${timeFmt(e)}`;
  }
  return `${dayFmt(s)} ${timeFmt(s)} → ${dayFmt(e)} ${timeFmt(e)}`;
}

function ComparisonCard({ item, onDelete }) {
  const { scheduledShift, workShift, comparison } = item;
  const headline = getHeadlineLabel(comparison);
  const statusColor = getStatusColor(comparison.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.driverName}>{scheduledShift.driver?.name}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusPillText, { color: statusColor }]}>{headline}</Text>
        </View>
      </View>

      <Text style={styles.rangeLine}>Programado: {formatRange(scheduledShift.scheduledStart, scheduledShift.scheduledEnd)}</Text>
      {workShift ? (
        <Text style={styles.rangeLine}>
          Real: {workShift.endedAt ? formatRange(workShift.startedAt, workShift.endedAt) : `desde ${formatTime(workShift.startedAt)}`}
        </Text>
      ) : null}

      {comparison.scheduledDurationMs != null && (
        <Text style={styles.metaLine}>Programado: {formatDurationMs(comparison.scheduledDurationMs)}</Text>
      )}
      {comparison.actualDurationMs != null && (
        <Text style={styles.metaLine}>
          {comparison.status === 'OPEN' ? 'Trabajado hasta ahora' : 'Trabajado'}: {formatDurationMs(comparison.actualDurationMs)}
        </Text>
      )}
      {comparison.differenceMs != null && (
        <Text style={[styles.diffLine, { color: statusColor }]}>{formatSignedDuration(comparison.differenceMs)}</Text>
      )}

      <Pressable style={styles.deleteLink} onPress={() => onDelete(scheduledShift._id)}>
        <Text style={styles.deleteLinkText}>Eliminar</Text>
      </Pressable>
    </View>
  );
}

export default function ScheduleScreen() {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [users, comparisonsData] = await Promise.all([usersApi.listUsers(token), scheduledShiftsApi.listComparisons(token)]);
      const driverUsers = users.filter((u) => u.role === 'driver');
      setDrivers(driverUsers);
      if (driverUsers.length > 0) {
        setSelectedDriverId((current) => current || driverUsers[0]._id);
      }
      setComparisons(comparisonsData);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la programación');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setCreateError('');
    if (!selectedDriverId) {
      setCreateError('Selecciona un chofer');
      return;
    }
    if (!startInput || !endInput) {
      setCreateError('Indica inicio y fin programados');
      return;
    }
    const start = new Date(startInput);
    const end = new Date(endInput);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setCreateError('Fechas inválidas');
      return;
    }
    if (end <= start) {
      setCreateError('El fin programado debe ser posterior al inicio');
      return;
    }
    setCreating(true);
    try {
      await scheduledShiftsApi.createScheduledShift(token, {
        driver: selectedDriverId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
      setStartInput('');
      setEndInput('');
      await load();
    } catch (err) {
      setCreateError(err.message || 'No se pudo crear el turno programado');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      await scheduledShiftsApi.deleteScheduledShift(token, id);
      await load();
    } catch (err) {
      setLoadError(err.message || 'No se pudo eliminar el turno programado');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Programación" backHref="/admin" onRefresh={load} refreshing={loading} />

      <Link href="/admin/shifts" asChild>
        <Pressable style={styles.shiftsLink}>
          <Text style={styles.shiftsLinkText}>Ver/editar turnos individuales →</Text>
        </Pressable>
      </Link>

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      <Text style={styles.sectionTitle}>Nuevo turno programado</Text>
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
      {drivers.length === 0 && !loading && <Text style={styles.empty}>No hay choferes registrados.</Text>}

      <Text style={styles.label}>Inicio programado</Text>
      <TextInput
        style={styles.input}
        value={startInput}
        onChangeText={setStartInput}
        placeholder={toLocalInputValue(new Date())}
        placeholderTextColor={colors.textTertiary}
      />
      <Text style={styles.label}>Fin programado</Text>
      <TextInput
        style={styles.input}
        value={endInput}
        onChangeText={setEndInput}
        placeholder={toLocalInputValue(new Date())}
        placeholderTextColor={colors.textTertiary}
      />

      {createError ? <Text style={styles.error}>{createError}</Text> : null}
      <Pressable style={styles.createButton} onPress={handleCreate} disabled={creating}>
        {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Programar turno</Text>}
      </Pressable>

      <Text style={styles.sectionTitle}>Programado vs. real</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      ) : comparisons.length === 0 ? (
        <Text style={styles.empty}>Todavía no hay turnos programados.</Text>
      ) : (
        comparisons.map((item) => <ComparisonCard key={item.scheduledShift._id} item={item} onDelete={handleDelete} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  shiftsLink: { alignSelf: 'flex-start', marginBottom: spacing.md },
  shiftsLinkText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  error: { color: colors.danger, marginBottom: spacing.sm },
  empty: { color: colors.textSecondary, marginTop: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },
  label: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.primary, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  createButton: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...softShadow,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  driverName: { ...typography.headline, color: colors.textPrimary },
  statusPill: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  rangeLine: { ...typography.callout, color: colors.textPrimary, marginTop: spacing.xs },
  metaLine: { ...typography.subhead, color: colors.textSecondary, marginTop: 2 },
  diffLine: { fontSize: 15, fontWeight: '700', marginTop: spacing.xs },
  deleteLink: { alignSelf: 'flex-start', marginTop: spacing.sm },
  deleteLinkText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
});
