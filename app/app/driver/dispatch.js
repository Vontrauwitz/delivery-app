import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as dispatchApi from '../../src/modules/dispatch/api';
import { openInMaps } from '../../src/shared/openInMaps';
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_COLORS } from '../../src/shared/constants';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

export default function DriverDispatchScreen() {
  const { token } = useAuth();
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState(null);
  // Past dispatches are collapsed by default (only label/address/status) — tapping one opens it
  // to reveal the note and the "abrir en mapas" link, same "tap to open details" affordance as
  // the inbox. Active dispatches stay always-expanded since their primary action (Aceptar/
  // Completar) needs to be visible without an extra tap.
  const [expandedPastId, setExpandedPastId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDispatches(await dispatchApi.listMine(token));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los dispatches');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAccept(id) {
    setActingId(id);
    setError('');
    try {
      const updated = await dispatchApi.acceptDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setError(err.message || 'No se pudo aceptar el dispatch');
    } finally {
      setActingId(null);
    }
  }

  async function handleComplete(id) {
    setActingId(id);
    setError('');
    try {
      const updated = await dispatchApi.completeDispatch(token, id);
      setDispatches((prev) => prev.map((d) => (d._id === updated._id ? updated : d)));
    } catch (err) {
      setError(err.message || 'No se pudo completar el dispatch');
    } finally {
      setActingId(null);
    }
  }

  const active = dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED');
  const past = dispatches.filter((d) => d.status === 'COMPLETED' || d.status === 'CANCELLED');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={active.length > 0 ? `Dispatch (${active.length} activo${active.length > 1 ? 's' : ''})` : 'Dispatch'}
        backHref="/driver"
        onRefresh={load}
        refreshing={loading}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Activos</Text>
          {active.length === 0 ? (
            <Text style={styles.empty}>No tienes dispatches activos.</Text>
          ) : (
            active.map((d) => (
              <View key={d._id} style={styles.card}>
                <View style={styles.cardRow}>
                  <Text style={styles.label} numberOfLines={1}>
                    {d.destinationLabel || d.address}
                  </Text>
                  <Text style={[styles.status, { color: DISPATCH_STATUS_COLORS[d.status] }]}>
                    {DISPATCH_STATUS_LABELS[d.status]}
                  </Text>
                </View>
                <Text style={styles.address}>{d.address}</Text>
                {d.note ? <Text style={styles.note}>Nota: {d.note}</Text> : null}

                <Pressable style={styles.mapsButton} onPress={() => openInMaps(d.mapsUrl)}>
                  <Text style={styles.mapsButtonText}>Abrir en mapas</Text>
                </Pressable>

                {d.status === 'PENDING' && (
                  <Pressable style={styles.actionButton} onPress={() => handleAccept(d._id)} disabled={actingId === d._id}>
                    {actingId === d._id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Aceptar</Text>}
                  </Pressable>
                )}
                {d.status === 'ACCEPTED' && (
                  <Pressable
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => handleComplete(d._id)}
                    disabled={actingId === d._id}
                  >
                    {actingId === d._id ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Marcar completado</Text>}
                  </Pressable>
                )}
              </View>
            ))
          )}

          {past.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Historial</Text>
              {past.map((d) => {
                const expanded = expandedPastId === d._id;
                return (
                  <Pressable
                    key={d._id}
                    style={styles.card}
                    onPress={() => setExpandedPastId(expanded ? null : d._id)}
                  >
                    <View style={styles.cardRow}>
                      <Text style={styles.label} numberOfLines={1}>
                        {d.destinationLabel || d.address}
                      </Text>
                      <Text style={[styles.status, { color: DISPATCH_STATUS_COLORS[d.status] }]}>
                        {DISPATCH_STATUS_LABELS[d.status]}
                      </Text>
                    </View>
                    <Text style={styles.address}>{d.address}</Text>
                    {expanded && (
                      <>
                        {d.note ? <Text style={styles.note}>Nota: {d.note}</Text> : null}
                        <Pressable style={styles.mapsButton} onPress={() => openInMaps(d.mapsUrl)}>
                          <Text style={styles.mapsButtonText}>Abrir en mapas</Text>
                        </Pressable>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.sm },
  empty: { color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...softShadow,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  label: { ...typography.headline, fontSize: 16, flexShrink: 1, color: colors.textPrimary },
  status: { ...typography.caption, fontWeight: '700' },
  address: { ...typography.subhead, color: colors.textSecondary, marginTop: 2 },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: 'italic' },
  mapsButton: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
  mapsButtonText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  actionButton: { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
  completeButton: { backgroundColor: colors.success },
  actionButtonText: { color: '#fff', fontWeight: '600' },
});
