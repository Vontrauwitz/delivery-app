import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as accountingPeriodsApi from '../../src/modules/accountingPeriods/api';
import { formatDurationMs } from '../../src/shared/duration';
import ScreenHeader from '../../src/shared/ScreenHeader';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

export default function AccountingPeriodsScreen() {
  const { token } = useAuth();
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(Date.now());

  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [currentData, historyData] = await Promise.all([
        accountingPeriodsApi.getCurrentPeriod(token),
        accountingPeriodsApi.listPeriods(token),
      ]);
      setCurrent(currentData);
      setHistory(historyData.filter((p) => p.status === 'CLOSED'));
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  async function handleClose() {
    setError('');
    setClosing(true);
    try {
      await accountingPeriodsApi.closePeriod(token);
      setConfirming(false);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo cerrar el período');
    } finally {
      setClosing(false);
    }
  }

  const elapsedMs = current ? Math.max(0, now - new Date(current.startedAt).getTime()) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="Períodos contables" backHref="/admin" onRefresh={load} refreshing={loading} />

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>Período actual</Text>
            <Text style={styles.currentSince}>Abierto desde {formatDateTime(current.startedAt)}</Text>
            <Text style={styles.currentElapsed}>{formatDurationMs(elapsedMs)} transcurridas</Text>

            {!confirming ? (
              <Pressable style={styles.closeButton} onPress={() => setConfirming(true)}>
                <Text style={styles.closeButtonText}>Cerrar período contable</Text>
              </Pressable>
            ) : (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  Se cerrará el período actual y se abrirá uno nuevo de inmediato. Esta acción no se puede deshacer.
                </Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.confirmRow}>
                  <Pressable style={styles.confirmButton} onPress={handleClose} disabled={closing}>
                    {closing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmButtonText}>Confirmar cierre</Text>}
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setConfirming(false)} disabled={closing}>
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Historial</Text>
          {history.length === 0 ? (
            <Text style={styles.empty}>Todavía no hay períodos cerrados.</Text>
          ) : (
            history.map((period) => (
              <View key={period._id} style={styles.historyCard}>
                <Text style={styles.historyRange}>
                  {formatDateTime(period.startedAt)} → {formatDateTime(period.endedAt)}
                </Text>
                <Text style={styles.historyDuration}>
                  {formatDurationMs(new Date(period.endedAt).getTime() - new Date(period.startedAt).getTime())}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  error: { color: colors.danger, marginBottom: spacing.sm },
  empty: { color: colors.textSecondary, marginTop: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm },

  currentCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...softShadow,
  },
  currentLabel: { ...typography.subhead, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  currentSince: { ...typography.body, color: colors.textPrimary, marginTop: spacing.sm },
  currentElapsed: { ...typography.title, color: colors.textPrimary, marginTop: spacing.xs, marginBottom: spacing.lg },
  closeButton: { backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  confirmBox: { backgroundColor: colors.warningMuted, borderRadius: radii.md, padding: spacing.md },
  confirmText: { ...typography.callout, color: colors.textPrimary, marginBottom: spacing.md },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmButton: { flex: 1, backgroundColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  confirmButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },

  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyRange: { ...typography.callout, color: colors.textPrimary },
  historyDuration: { ...typography.subhead, color: colors.textSecondary, marginTop: spacing.xs },
});
