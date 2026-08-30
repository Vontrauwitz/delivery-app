import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as alertsApi from '../../src/modules/alerts/api';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { ALERT_SEVERITY_LABELS, ALERT_SEVERITY_COLORS, ALERT_STATUS_LABELS } from '../../src/shared/constants';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

const TABS = [
  { key: 'OPEN', label: 'Abiertas' },
  { key: 'ACKNOWLEDGED', label: 'Reconocidas' },
  { key: 'RESOLVED', label: 'Historial' },
];

// "1h 10min" / "25min" — same style as the dashboard's own overdue-duration formatting.
function formatMinutesAgo(dateValue) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(dateValue).getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `hace ${m}min`;
  return m === 0 ? `hace ${h}h` : `hace ${h}h ${m}min`;
}

// Dispatch/Messages-style top-level header: reached directly from the dashboard, not nested
// under Configuración — Alertas (operational) is deliberately a different screen from
// Configuración > Alertas (rule settings).
function Header({ onHome }) {
  return (
    <View style={styles.headerRow}>
      <Text style={styles.title}>Alertas</Text>
      <Pressable style={styles.iconButton} onPress={onHome} hitSlop={8}>
        <Ionicons name="home-outline" size={18} color={neoColors.ink} />
      </Pressable>
    </View>
  );
}

export default function AdminAlertsScreen() {
  const { token } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState('OPEN');
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ackingId, setAckingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // GET /alerts evaluates server-side before listing — always authoritative, never a
      // frontend-computed guess at whether a condition is currently true.
      setAlerts(await alertsApi.listAlerts(token, { status: tab }));
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las alertas');
    } finally {
      setLoading(false);
    }
  }, [token, tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAcknowledge(id) {
    setAckingId(id);
    setError('');
    try {
      await alertsApi.acknowledgeAlert(token, id);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo reconocer la alerta');
    } finally {
      setAckingId(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Header onHome={() => router.push('/admin')} />

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.refreshRow} onPress={load} hitSlop={8}>
        <Text style={styles.refreshText}>{loading ? 'Actualizando…' : 'Actualizar'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.xl }} />
      ) : alerts.length === 0 ? (
        <Text style={styles.empty}>
          {tab === 'OPEN' ? 'Sin alertas abiertas — todo en orden.' : tab === 'ACKNOWLEDGED' ? 'Sin alertas reconocidas pendientes.' : 'Sin historial todavía.'}
        </Text>
      ) : (
        alerts.map((a) => {
          const isExpanded = expandedId === a._id;
          const color = ALERT_SEVERITY_COLORS[a.severity];
          return (
            <NeoCard key={a._id} accentColor={color} style={styles.cardWrap} contentStyle={styles.cardBody}>
              <Pressable onPress={() => setExpandedId(isExpanded ? null : a._id)}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.alertTitle} numberOfLines={isExpanded ? undefined : 2}>
                    {a.title}
                  </Text>
                  <View style={[styles.severityPill, { backgroundColor: `${color}22` }]}>
                    <Text style={[styles.severityPillText, { color }]}>{ALERT_SEVERITY_LABELS[a.severity]}</Text>
                  </View>
                </View>
                <Text style={styles.alertMeta}>{formatMinutesAgo(a.lastTriggeredAt)}</Text>
              </Pressable>

              {isExpanded && (
                <View style={styles.detailBox}>
                  <Text style={styles.detailLine}>{a.summary}</Text>
                  {a.driver ? <Text style={styles.detailLine}>Chofer: {a.driver.name}</Text> : null}
                  {a.vehicle ? <Text style={styles.detailLine}>Vehículo: {a.vehicle.name}</Text> : null}
                  <Text style={styles.detailLine}>Estado: {ALERT_STATUS_LABELS[a.status]}</Text>
                  {a.status !== 'OPEN' && a.acknowledgedBy ? (
                    <Text style={styles.detailLine}>Reconocida por: {a.acknowledgedBy.name}</Text>
                  ) : null}

                  {a.status === 'OPEN' && (
                    <Pressable
                      style={styles.ackButton}
                      onPress={() => handleAcknowledge(a._id)}
                      disabled={ackingId === a._id}
                      hitSlop={8}
                    >
                      {ackingId === a._id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ackButtonText}>Reconocer</Text>}
                    </Pressable>
                  )}
                </View>
              )}
            </NeoCard>
          );
        })
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

  tabRow: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    overflow: 'hidden',
    marginBottom: neoSpacing.sm,
  },
  tab: { flex: 1, paddingVertical: neoSpacing.sm, alignItems: 'center', backgroundColor: neoColors.surface },
  tabActive: { backgroundColor: neoColors.primary },
  tabText: { fontWeight: '700', fontSize: 13, color: neoColors.ink },
  tabTextActive: { color: '#fff' },

  refreshRow: { alignSelf: 'flex-end', marginBottom: neoSpacing.md },
  refreshText: { ...neoTypography.caption, color: neoColors.primary },

  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.lg, fontStyle: 'italic' },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: neoSpacing.sm },
  alertTitle: { fontSize: 15, fontWeight: '800', color: neoColors.ink, flex: 1 },
  alertMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },
  severityPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4 },
  severityPillText: { fontSize: 11, fontWeight: '800' },

  detailBox: { marginTop: neoSpacing.sm, borderTopWidth: 2, borderTopColor: neoColors.neutralMuted, paddingTop: neoSpacing.sm },
  detailLine: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 2 },

  ackButton: {
    marginTop: neoSpacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: neoColors.primary,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.xs,
  },
  ackButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
