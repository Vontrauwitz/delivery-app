import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as approvalsApi from '../../src/modules/approvals/api';
import * as usersApi from '../../src/modules/users/api';
import * as replenishmentApi from '../../src/modules/replenishment/api';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as dashboardApi from '../../src/modules/dashboard/api';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { formatCurrency } from '../../src/shared/money';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

// No device/width branching needed: every card below uses a flexBasis/maxWidth auto-fill (same
// technique as the products grid) so column count — 1 on a narrow phone, 2 on tablet, 3-4 on
// desktop — falls out of real available width via pure flexWrap reflow.
const CONTENT_MAX_WIDTH = 1180;

const SECONDARY = [
  { href: '/admin/schedule', label: 'Programación' },
  { href: '/admin/products', label: 'Productos' },
  { href: '/admin/promotions', label: 'Promociones' },
  { href: '/admin/weekly-report', label: 'Reportes' },
  { href: '/admin/settings', label: 'Configuración' },
];

function isToday(dateValue) {
  return new Date(dateValue).toDateString() === new Date().toDateString();
}

// "1h 10min" / "25min" — for the SHOULD_HAVE_ENDED alert's "how long past expected end".
function formatOverdueDuration(minutes) {
  if (minutes == null) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function MetricCard({ title, value, hint, accentColor, onPress }) {
  return (
    <NeoCard accentColor={accentColor} onPress={onPress} style={styles.metricWrap} contentStyle={styles.metricCard}>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricHint} numberOfLines={1}>
        {hint}
      </Text>
    </NeoCard>
  );
}

function PanelHeader({ title }) {
  return <Text style={styles.panelTitle}>{title}</Text>;
}

function SalesBarChart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.total));
  return (
    <View style={styles.barRow}>
      {daily.map((d) => {
        const pct = Math.max(4, Math.round((d.total / max) * 100));
        const label = new Date(`${d.date}T00:00:00`).toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
        return (
          <View key={d.date} style={styles.barCol}>
            <Text style={styles.barCount}>{d.count > 0 ? d.count : ''}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${pct}%` }]} />
            </View>
            <Text style={styles.barLabel}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PaymentSplit({ split }) {
  const cash = split.cash || 0;
  const transfer = split.transfer || 0;
  const total = cash + transfer;
  const rows = [
    { label: 'Efectivo', value: cash, color: neoColors.success },
    { label: 'Transferencia', value: transfer, color: neoColors.primary },
  ];
  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} style={styles.paymentBlock}>
          <View style={styles.paymentHeaderRow}>
            <Text style={styles.paymentLabel}>{row.label}</Text>
            <Text style={styles.paymentValue}>{formatCurrency(row.value)}</Text>
          </View>
          <View style={styles.paymentTrack}>
            <View style={[styles.paymentFill, { width: `${total > 0 ? (row.value / total) * 100 : 0}%`, backgroundColor: row.color }]} />
          </View>
        </View>
      ))}
      {total === 0 && <Text style={styles.panelEmpty}>Sin ventas en el periodo.</Text>}
    </View>
  );
}

export default function AdminHome() {
  const { user, token, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [pendingSales, setPendingSales] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [salesStats, setSalesStats] = useState(null);
  const [scheduleComparisons, setScheduleComparisons] = useState([]);
  // Live per-driver expected-vs-actual status for TODAY (driver-schedule module) — this is what
  // now powers the "still working past expected end" alert, replacing the old retrospective
  // EXTENDED-based one (compareShift only ever classifies EXTENDED after a shift closes, so it
  // could never actually fire for a currently-open shift — see shared/scheduleResolution.js).
  const [driverScheduleStatuses, setDriverScheduleStatuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  // Fleet-wide "needs attention" — same replenishment formula as everywhere else, just called
  // once per driver. Always kept up to date regardless of which driver is selected below, since
  // the Inventario metric card reads from this too.
  const [attentionItems, setAttentionItems] = useState([]);

  const [selectedDriverId, setSelectedDriverId] = useState('ALL');
  const [driverStock, setDriverStock] = useState(null);
  const [driverStockLoading, setDriverStockLoading] = useState(false);

  const [replenishingKey, setReplenishingKey] = useState(null);
  const [replenishError, setReplenishError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [pending, shifts, stats, comparisons, driverStatuses, usersData] = await Promise.all([
        approvalsApi.listPendingSales(token),
        dashboardApi.getOpenShifts(token),
        dashboardApi.getSalesStats(token, 7),
        dashboardApi.getScheduleComparisons(token),
        dashboardApi.getDriverScheduleStatuses(token),
        usersApi.listUsers(token),
      ]);
      setPendingSales(pending);
      setOpenShifts(shifts);
      setSalesStats(stats);
      setScheduleComparisons(comparisons);
      setDriverScheduleStatuses(driverStatuses);
      const driversData = usersData.filter((u) => u.role === 'driver');
      setDrivers(driversData);

      const results = await Promise.all(
        driversData.map((d) =>
          replenishmentApi
            .getSuggestions(token, d._id)
            .then((r) => ({ driver: d, rows: r.rows }))
            .catch(() => ({ driver: d, rows: [] }))
        )
      );
      const items = [];
      results.forEach(({ driver, rows }) => {
        rows.forEach((row) => {
          if (row.suggestedReplenishment > 0) items.push({ driver, ...row });
        });
      });
      items.sort((a, b) => b.suggestedReplenishment - a.suggestedReplenishment);
      setAttentionItems(items);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar el panel');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (selectedDriverId === 'ALL') {
      setDriverStock(null);
      return undefined;
    }
    let cancelled = false;
    setDriverStockLoading(true);
    inventoryApi
      .getCurrentStock(token, selectedDriverId)
      .then((data) => {
        if (!cancelled) setDriverStock(data);
      })
      .catch(() => {
        if (!cancelled) setDriverStock(null);
      })
      .finally(() => {
        if (!cancelled) setDriverStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedDriverId]);

  async function refreshAfterReplenish() {
    await loadDashboard();
    if (selectedDriverId !== 'ALL') {
      try {
        setDriverStock(await inventoryApi.getCurrentStock(token, selectedDriverId));
      } catch {
        // best-effort refresh only
      }
    }
  }

  async function quickReplenishItem(driverId, productId, quantity) {
    const key = `${driverId}:${productId}`;
    setReplenishError('');
    setReplenishingKey(key);
    try {
      await inventoryApi.replenish(token, { driver: driverId, items: [{ product: productId, quantity }] });
      await refreshAfterReplenish();
    } catch (err) {
      setReplenishError(err.message || 'No se pudo reponer');
    } finally {
      setReplenishingKey(null);
    }
  }

  async function quickReplenishAllSuggested() {
    if (selectedDriverId === 'ALL') return;
    setReplenishError('');
    setReplenishingKey('ALL');
    try {
      const suggestions = await replenishmentApi.getSuggestions(token, selectedDriverId);
      const items = suggestions.rows
        .filter((r) => r.suggestedReplenishment > 0)
        .map((r) => ({ product: r.product._id, quantity: r.suggestedReplenishment }));
      if (items.length > 0) {
        await inventoryApi.replenish(token, { driver: selectedDriverId, items });
        await refreshAfterReplenish();
      }
    } catch (err) {
      setReplenishError(err.message || 'No se pudo reponer');
    } finally {
      setReplenishingKey(null);
    }
  }

  const todayEntry = salesStats?.daily?.[salesStats.daily.length - 1];
  const notStartedToday = scheduleComparisons.filter(
    (c) => c.comparison.status === 'NOT_STARTED' && isToday(c.scheduledShift.scheduledStart)
  );
  // Live, not retrospective: sourced from driver-schedule status (deriveOperationalStatus),
  // which compares an OPEN WorkShift against its resolved expected end in real time. The old
  // compareShift EXTENDED status only ever classifies a shift after it closes, so it could never
  // actually alert on a shift that is still running late — this replaces that dead alert.
  const overdueShifts = driverScheduleStatuses.filter((s) => s.status === 'SHOULD_HAVE_ENDED');

  const alerts = [
    pendingSales.length > 0 && {
      key: 'pending',
      color: neoColors.warning,
      text: `${pendingSales.length} venta${pendingSales.length === 1 ? '' : 's'} pendiente${pendingSales.length === 1 ? '' : 's'} de aprobar`,
      href: '/admin/sales-pending',
    },
    attentionItems.length > 0 && {
      key: 'lowstock',
      color: neoColors.warning,
      text: `${attentionItems.length} producto${attentionItems.length === 1 ? '' : 's'} necesitan reposición`,
      href: '/admin/inventory',
    },
    ...overdueShifts.map((s) => ({
      key: `overdue-${s.driver._id}`,
      color: neoColors.danger,
      text: `${s.driver.name}: turno abierto ${formatOverdueDuration(s.endDiffMinutes)} después de lo esperado`,
      href: '/admin/shifts',
    })),
    ...notStartedToday.map((c) => ({
      key: `notstart-${c.scheduledShift._id}`,
      color: neoColors.warning,
      text: `${c.scheduledShift.driver.name}: turno programado hoy, todavía no lo inicia`,
      href: '/admin/schedule',
    })),
  ].filter(Boolean);

  const metrics = [
    {
      key: 'pending',
      title: 'Ventas pendientes',
      value: String(pendingSales.length),
      hint: pendingSales.length > 0 ? 'Requieren revisión' : 'Todo al día',
      color: pendingSales.length > 0 ? neoColors.warning : neoColors.success,
      href: '/admin/sales-pending',
    },
    {
      key: 'working',
      title: 'Choferes trabajando',
      value: String(openShifts.length),
      hint: openShifts.length > 0 ? openShifts.map((s) => s.driver?.name).join(', ') : 'Nadie en turno',
      color: neoColors.primary,
      href: '/admin/shifts',
    },
    {
      key: 'today',
      title: 'Ventas de hoy',
      value: formatCurrency(todayEntry?.total || 0),
      hint: `${todayEntry?.count || 0} venta${todayEntry?.count === 1 ? '' : 's'}`,
      color: neoColors.success,
      href: '/admin/sales-pending',
    },
    {
      key: 'inventory',
      title: 'Inventario',
      value: String(attentionItems.length),
      hint: attentionItems.length > 0 ? 'necesitan reposición' : 'Todo abastecido',
      color: attentionItems.length > 0 ? neoColors.warning : neoColors.success,
      href: '/admin/inventory',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name}</Text>
          <Text style={styles.subtitle}>Panel administrativo</Text>
        </View>
        <Pressable onPress={loadDashboard} hitSlop={8}>
          <Text style={styles.refresh}>{loading ? 'Actualizando…' : 'Actualizar'}</Text>
        </Pressable>
      </View>

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {/* TOP METRIC CARDS */}
      <View style={styles.metricGrid}>
        {metrics.map((m) => (
          <MetricCard key={m.key} title={m.title} value={m.value} hint={m.hint} accentColor={m.color} onPress={() => router.push(m.href)} />
        ))}
      </View>

      {/* ALERTS */}
      <NeoCard style={styles.sectionWrap} contentStyle={styles.panel}>
        <PanelHeader title="Alertas operativas" />
        {loading ? (
          <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
        ) : alerts.length === 0 ? (
          <Text style={styles.panelEmpty}>Sin alertas — todo en orden.</Text>
        ) : (
          alerts.map((a) => (
            <Pressable key={a.key} style={styles.alertRow} onPress={() => router.push(a.href)}>
              <View style={[styles.alertDot, { backgroundColor: a.color }]} />
              <Text style={styles.alertText}>{a.text}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
        )}
      </NeoCard>

      {/* INVENTORY QUICK VIEW */}
      <NeoCard style={styles.sectionWrap} contentStyle={styles.panel}>
        <PanelHeader title="Inventario — vista rápida" />

        <View style={styles.chipRow}>
          <Pressable
            style={[styles.chip, selectedDriverId === 'ALL' && styles.chipActive]}
            onPress={() => setSelectedDriverId('ALL')}
          >
            <Text style={[styles.chipText, selectedDriverId === 'ALL' && styles.chipTextActive]}>Todos los choferes</Text>
          </Pressable>
          {drivers.map((d) => (
            <Pressable
              key={d._id}
              style={[styles.chip, selectedDriverId === d._id && styles.chipActive]}
              onPress={() => setSelectedDriverId(d._id)}
            >
              <Text style={[styles.chipText, selectedDriverId === d._id && styles.chipTextActive]}>{d.name}</Text>
            </Pressable>
          ))}
        </View>

        {replenishError ? <Text style={styles.error}>{replenishError}</Text> : null}

        {selectedDriverId === 'ALL' ? (
          loading ? (
            <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
          ) : attentionItems.length === 0 ? (
            <Text style={styles.panelEmpty}>Ningún chofer necesita reposición ahora mismo.</Text>
          ) : (
            <>
              {attentionItems.slice(0, 6).map((item) => {
                const key = `${item.driver._id}:${item.product._id}`;
                return (
                  <View key={key} style={styles.attentionRow}>
                    <Text style={styles.attentionIcon}>{item.product.icon || '📦'}</Text>
                    <View style={styles.attentionInfo}>
                      <Text style={styles.attentionName}>{item.product.name}</Text>
                      <Text style={styles.attentionMeta}>
                        {item.driver.name} · quedan {item.currentStock}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.reponerButton}
                      onPress={() => quickReplenishItem(item.driver._id, item.product._id, item.suggestedReplenishment)}
                      disabled={replenishingKey === key}
                    >
                      {replenishingKey === key ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.reponerButtonText}>+{item.suggestedReplenishment}</Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
              <Pressable style={styles.panelLink} onPress={() => router.push('/admin/inventory')}>
                <Text style={styles.panelLinkText}>Ver inventario completo →</Text>
              </Pressable>
            </>
          )
        ) : driverStockLoading ? (
          <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
        ) : !driverStock || driverStock.stock.length === 0 ? (
          <Text style={styles.panelEmpty}>Este chofer todavía no tiene productos en inventario.</Text>
        ) : (
          <>
            <Pressable
              style={styles.reponerAllButton}
              onPress={quickReplenishAllSuggested}
              disabled={replenishingKey === 'ALL'}
            >
              {replenishingKey === 'ALL' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reponerAllButtonText}>Reponer sugerido</Text>
              )}
            </Pressable>
            {driverStock.stock.map((s, index) => (
              <View key={s.product._id} style={[styles.stockRow, index === driverStock.stock.length - 1 && styles.stockRowLast]}>
                <Text style={styles.attentionIcon}>{s.product.icon || '📦'}</Text>
                <Text style={styles.stockName}>{s.product.name}</Text>
                <Text style={styles.stockQty}>{s.quantityExpected}</Text>
              </View>
            ))}
          </>
        )}
      </NeoCard>

      {/* VISUAL ANALYTICS */}
      <View style={styles.analyticsGrid}>
        <NeoCard style={styles.analyticsWrap} contentStyle={styles.panel}>
          <PanelHeader title="Ventas — últimos 7 días" />
          {loading ? (
            <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
          ) : salesStats ? (
            <SalesBarChart daily={salesStats.daily} />
          ) : null}
        </NeoCard>

        <NeoCard style={styles.analyticsWrap} contentStyle={styles.panel}>
          <PanelHeader title="Métodos de pago (7 días)" />
          {loading ? (
            <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
          ) : salesStats ? (
            <PaymentSplit split={salesStats.paymentSplit} />
          ) : null}
        </NeoCard>

        <NeoCard style={styles.analyticsWrap} contentStyle={styles.panel}>
          <PanelHeader title="Productos más vendidos (7 días)" />
          {loading ? (
            <ActivityIndicator color={neoColors.primary} style={styles.panelLoading} />
          ) : !salesStats || salesStats.topProducts.length === 0 ? (
            <Text style={styles.panelEmpty}>Sin ventas en el periodo.</Text>
          ) : (
            salesStats.topProducts.map((p, index) => (
              <View key={p.product._id} style={[styles.topProductRow, index === salesStats.topProducts.length - 1 && styles.stockRowLast]}>
                <Text style={styles.attentionIcon}>{p.product.icon || '📦'}</Text>
                <Text style={styles.stockName}>{p.product.name}</Text>
                <Text style={styles.topProductQty}>×{p.quantity}</Text>
                <Text style={styles.topProductRevenue}>{formatCurrency(p.revenue)}</Text>
              </View>
            ))
          )}
        </NeoCard>
      </View>

      {/* SECONDARY NAV — quieter, lower */}
      <View style={styles.secondaryList}>
        {SECONDARY.map((item, index) => (
          <Pressable
            key={item.href}
            style={[styles.secondaryRow, index === SECONDARY.length - 1 && styles.secondaryRowLast]}
            onPress={() => router.push(item.href)}
          >
            <Text style={styles.secondaryLabel}>{item.label}</Text>
            <Text style={styles.secondaryChevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tertiaryRow}>
        <Pressable onPress={() => router.push('/admin/messages')}>
          <Text style={styles.tertiaryLink}>Mensajes</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/admin/dispatch')}>
          <Text style={styles.tertiaryLink}>Dispatch</Text>
        </Pressable>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl, maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: neoSpacing.lg },
  greeting: { ...neoTypography.title, color: neoColors.ink },
  subtitle: { ...neoTypography.body, color: neoColors.textSecondary, marginTop: 2 },
  refresh: { ...neoTypography.caption, color: neoColors.primary, marginTop: neoSpacing.xs },
  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },

  // Metric cards: flexBasis/maxWidth auto-fill — 1 col narrow, 2 tablet, 3-4 desktop, purely
  // from available width, no device breakpoints at all.
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: neoSpacing.xs },
  metricWrap: { flexGrow: 1, flexBasis: 260, maxWidth: 380 },
  metricCard: { padding: neoSpacing.lg, minHeight: 120 },
  metricTitle: { ...neoTypography.headline, color: neoColors.textSecondary },
  metricValue: { ...neoTypography.display, color: neoColors.ink, marginTop: neoSpacing.xs },
  metricHint: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs },

  sectionWrap: { width: '100%', marginTop: neoSpacing.lg },
  panel: { padding: neoSpacing.lg },
  panelTitle: { ...neoTypography.headline, color: neoColors.ink, marginBottom: neoSpacing.md },
  panelEmpty: { ...neoTypography.body, color: neoColors.textSecondary, fontStyle: 'italic' },
  panelLoading: { marginVertical: neoSpacing.md },
  panelLink: { marginTop: neoSpacing.sm, alignItems: 'center' },
  panelLinkText: { ...neoTypography.caption, color: neoColors.primary },

  alertRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: neoSpacing.sm, gap: neoSpacing.sm },
  alertDot: { width: 10, height: 10, borderRadius: 5 },
  alertText: { ...neoTypography.body, color: neoColors.ink, flex: 1 },
  chevron: { color: neoColors.textTertiary, fontSize: 18 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.xs, marginBottom: neoSpacing.md },
  chip: {
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.full,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.xs,
    backgroundColor: neoColors.surface,
  },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { ...neoTypography.caption, color: neoColors.ink },
  chipTextActive: { color: '#fff' },

  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm, paddingVertical: neoSpacing.sm },
  attentionIcon: { fontSize: 24 },
  attentionInfo: { flex: 1 },
  attentionName: { ...neoTypography.body, fontWeight: '700', color: neoColors.ink },
  attentionMeta: { ...neoTypography.caption, color: neoColors.textSecondary },
  reponerButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.sm, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm, minWidth: 56, alignItems: 'center' },
  reponerButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  reponerAllButton: {
    backgroundColor: neoColors.primary,
    borderRadius: neoRadii.md,
    paddingVertical: neoSpacing.md,
    alignItems: 'center',
    marginBottom: neoSpacing.md,
  },
  reponerAllButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm, paddingVertical: neoSpacing.sm, borderBottomWidth: 1, borderBottomColor: neoColors.neutralMuted },
  stockRowLast: { borderBottomWidth: 0 },
  stockName: { ...neoTypography.body, color: neoColors.ink, flex: 1 },
  stockQty: { ...neoTypography.body, fontWeight: '800', color: neoColors.ink },

  // Analytics panels: larger basis than metric cards since charts/lists need more room.
  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: neoSpacing.lg },
  analyticsWrap: { flexGrow: 1, flexBasis: 320, maxWidth: 420 },

  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: neoSpacing.sm, height: 130 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barCount: { ...neoTypography.caption, color: neoColors.textSecondary, marginBottom: 2 },
  barTrack: { width: '100%', height: 90, justifyContent: 'flex-end', backgroundColor: neoColors.neutralMuted, borderRadius: neoRadii.sm, overflow: 'hidden' },
  bar: { width: '100%', backgroundColor: neoColors.primary, borderRadius: neoRadii.sm },
  barLabel: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: neoSpacing.xs, textTransform: 'capitalize' },

  paymentBlock: { marginBottom: neoSpacing.md },
  paymentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: neoSpacing.xs },
  paymentLabel: { ...neoTypography.body, color: neoColors.ink },
  paymentValue: { ...neoTypography.body, fontWeight: '800', color: neoColors.ink },
  paymentTrack: { height: 10, backgroundColor: neoColors.neutralMuted, borderRadius: neoRadii.full, overflow: 'hidden' },
  paymentFill: { height: '100%', borderRadius: neoRadii.full },

  topProductRow: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm, paddingVertical: neoSpacing.sm, borderBottomWidth: 1, borderBottomColor: neoColors.neutralMuted },
  topProductQty: { ...neoTypography.caption, color: neoColors.textSecondary },
  topProductRevenue: { ...neoTypography.body, fontWeight: '800', color: neoColors.ink, marginLeft: neoSpacing.sm },

  secondaryList: {
    marginTop: neoSpacing.xl,
    borderTopWidth: 1,
    borderTopColor: neoColors.neutralMuted,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: neoSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: neoColors.neutralMuted,
  },
  secondaryRowLast: { borderBottomWidth: 0 },
  secondaryLabel: { ...neoTypography.body, color: neoColors.textSecondary },
  secondaryChevron: { color: neoColors.textTertiary, fontSize: 16 },

  tertiaryRow: { flexDirection: 'row', justifyContent: 'center', gap: neoSpacing.xl, marginTop: neoSpacing.xl },
  tertiaryLink: { color: neoColors.textTertiary, fontSize: 13 },

  signOutButton: { alignItems: 'center', marginTop: neoSpacing.xxl },
  signOutText: { color: neoColors.danger, fontSize: 13, fontWeight: '700' },
});
