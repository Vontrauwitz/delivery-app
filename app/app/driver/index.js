import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/modules/auth/useAuth';
import { useWorkShift } from '../../src/modules/workShifts/useWorkShift';
import { useAutoLocation } from '../../src/modules/locations/useAutoLocation';
import * as messagingApi from '../../src/modules/messaging/api';
import * as dispatchApi from '../../src/modules/dispatch/api';
import * as inventoryApi from '../../src/modules/inventory/api';
import * as authApi from '../../src/modules/auth/api';
import * as driverScheduleApi from '../../src/modules/driverSchedule/api';
import { formatDurationMs } from '../../src/shared/duration';
import { WEEKDAY_LETTERS } from '../../src/shared/dateKey';
import { colors, spacing, radii, typography, softShadow } from '../../src/shared/theme';

function formatShiftRange(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number);
  const endTotal = h * 60 + m + Number(durationMinutes);
  const endH = Math.floor((endTotal / 60) % 24);
  const endM = endTotal % 60;
  const dayOverflow = Math.floor(endTotal / (24 * 60));
  const pad = (n) => String(n).padStart(2, '0');
  return `${startTime}–${pad(endH)}:${pad(endM)}${dayOverflow > 0 ? ` (+${dayOverflow}d)` : ''}`;
}

// Read-only for the driver — no edit controls here at all, matching the manager-only ownership
// of both the recurring default schedule and any date exceptions (see app/admin/schedule.js).
function ScheduleSummary({ token }) {
  const [defaultShift, setDefaultShift] = useState(null);
  const [todayStatus, setTodayStatus] = useState(null);

  useEffect(() => {
    authApi.getMe(token).then((me) => setDefaultShift(me.defaultShift)).catch(() => {});
    driverScheduleApi.getMyStatus(token).then(setTodayStatus).catch(() => {});
  }, [token]);

  if (!defaultShift?.enabled) return null;

  const expected = todayStatus?.expected;
  // Only call out "today" separately when it actually deviates from the normal recurring
  // pattern (an exception or an explicit ScheduledShift) — an ordinary DEFAULT day needs no
  // extra emphasis beyond the weekly summary already shown below.
  const isOverridden = expected && expected.source !== 'DEFAULT';

  return (
    <View style={styles.scheduleCard}>
      <Text style={styles.scheduleTitle}>Tu horario habitual</Text>
      <View style={styles.dayRow}>
        {WEEKDAY_LETTERS.map((letter, idx) => {
          const isoDay = idx + 1;
          const active = (defaultShift.activeDays || []).includes(isoDay);
          return (
            <View key={isoDay} style={[styles.dayDot, active && styles.dayDotActive]}>
              <Text style={[styles.dayDotText, active && styles.dayDotTextActive]}>{letter}</Text>
            </View>
          );
        })}
      </View>
      {defaultShift.startTime && defaultShift.durationMinutes ? (
        <Text style={styles.scheduleRange}>{formatShiftRange(defaultShift.startTime, defaultShift.durationMinutes)}</Text>
      ) : null}

      {isOverridden && (
        <View style={styles.scheduleTodayBox}>
          <Text style={styles.scheduleTodayLabel}>Hoy es distinto</Text>
          {expected.isWorkingDay && expected.expectedStart && expected.expectedEnd ? (
            <Text style={styles.scheduleTodayText}>
              {new Date(expected.expectedStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
              {new Date(expected.expectedEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : (
            <Text style={styles.scheduleTodayText}>{expected.isWorkingDay ? 'Trabajas hoy' : 'Descanso hoy'}</Text>
          )}
          {!!expected.reason && <Text style={styles.scheduleTodayReason}>{expected.reason}</Text>}
        </View>
      )}
    </View>
  );
}

// Below this many units for any one product, the driver's inventory reads "bajo" — a simple,
// visible-at-a-glance heuristic, not a forecast.
const LOW_STOCK_THRESHOLD = 5;

const LOCATION_LABELS = { requesting: 'Detectando…', granted: 'Activa', denied: 'Sin permiso', unavailable: 'No disponible' };
const LOCATION_COLORS = { requesting: colors.neutral, granted: colors.success, denied: colors.danger, unavailable: colors.neutral };

function StatusChip({ label, value, color }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: color }]} />
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
    </View>
  );
}

// Inventory belongs to the driver, not a vehicle session — this reads the exact same source
// as the driver's own inventory screen and the manager's per-driver inventory screen, so the
// status shown here can never disagree with either.
async function loadInventoryStatus(token) {
  try {
    const current = await inventoryApi.getMyCurrentStock(token);
    if (!current.session) {
      return { label: 'Sin inventario', color: colors.neutral };
    }
    if (current.session.status === 'CLOSING_PENDING') {
      return { label: 'Conteo pendiente', color: colors.warning };
    }
    const isLow = current.stock.some((e) => e.quantityExpected >= 0 && e.quantityExpected <= LOW_STOCK_THRESHOLD);
    return isLow ? { label: 'Inventario bajo', color: colors.warning } : { label: 'Inventario OK', color: colors.success };
  } catch (err) {
    return { label: 'Sin inventario', color: colors.neutral };
  }
}

export default function DriverHome() {
  const { user, token, signOut } = useAuth();
  const {
    shift,
    loading: shiftLoading,
    busy: shiftBusy,
    loadError: shiftLoadError,
    actionError: shiftActionError,
    start,
    end,
    reload: reloadShift,
  } = useWorkShift(token);
  const location = useAutoLocation(token);

  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingDispatchCount, setPendingDispatchCount] = useState(0);
  const [inventoryStatus, setInventoryStatus] = useState({ label: 'Sin inventario', color: colors.neutral });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    messagingApi
      .listInbox(token)
      .then((messages) => setUnreadCount(messages.filter((m) => !m.isRead).length))
      .catch(() => {});
    dispatchApi
      .listMine(token)
      .then((dispatches) => setPendingDispatchCount(dispatches.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED').length))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!shift) return;
    loadInventoryStatus(token).then(setInventoryStatus);
  }, [token, shift]);

  useEffect(() => {
    if (!shift) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [shift]);

  if (shiftLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // The shift fetch itself failed (network blip, momentary backend error) — this is NOT a
  // confirmed "no active shift", so don't show "Iniciar turno" (which could error out with "ya
  // tienes un turno abierto" if the driver actually has one). Offer a retry instead, and never
  // sign the driver out over this — authentication already succeeded.
  if (!shift && shiftLoadError) {
    return (
      <View style={styles.heroContainer}>
        <Text style={styles.heroGreeting}>Hola, {user?.name}</Text>
        <Text style={styles.heroSubtitle}>No pudimos cargar tu turno</Text>
        <Text style={styles.error}>{shiftLoadError}</Text>

        <Pressable style={styles.heroButton} onPress={reloadShift}>
          <Text style={styles.heroButtonText}>Reintentar</Text>
        </Pressable>

        <Pressable onPress={signOut} style={styles.signOutLink}>
          <Text style={styles.signOutLinkText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  // Confirmed by the backend: no active shift. One obvious next action, nothing else competes
  // for attention.
  if (!shift) {
    return (
      <View style={styles.heroContainer}>
        <Text style={styles.heroGreeting}>Hola, {user?.name}</Text>
        <Text style={styles.heroSubtitle}>No tienes un turno activo</Text>

        <Pressable style={styles.heroButton} onPress={start} disabled={shiftBusy}>
          {shiftBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.heroButtonText}>Iniciar turno</Text>}
        </Pressable>
        {shiftActionError ? <Text style={styles.error}>{shiftActionError}</Text> : null}

        <StatusChip label="Ubicación" value={LOCATION_LABELS[location.status]} color={LOCATION_COLORS[location.status]} />

        <ScheduleSummary token={token} />

        <Pressable onPress={signOut} style={styles.signOutLink}>
          <Text style={styles.signOutLinkText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  const elapsedMs = Math.max(0, now - new Date(shift.startedAt).getTime());

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hola, {user?.name}</Text>

      <ScheduleSummary token={token} />

      <View style={styles.statusStrip}>
        <StatusChip label="Turno" value={formatDurationMs(elapsedMs)} color={colors.success} />
        <StatusChip label="Ubicación" value={LOCATION_LABELS[location.status]} color={LOCATION_COLORS[location.status]} />
        <StatusChip label="Inventario" value={inventoryStatus.label} color={inventoryStatus.color} />
      </View>

      {/* Selling only ever depends on having an active shift — never on inventory session
          state — so this is always the same solid, obvious primary action. */}
      <Link href="/driver/new-sale" asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Nueva venta</Text>
        </Pressable>
      </Link>

      <View style={styles.grid}>
        <Link href="/driver/inventory" asChild>
          <Pressable style={styles.tile}>
            <Text style={styles.tileText}>Inventario</Text>
          </Pressable>
        </Link>
        <Link href="/driver/inbox" asChild>
          <Pressable style={styles.tile}>
            <View style={styles.tileRow}>
              <Text style={styles.tileText}>Mensajes</Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount}</Text>
                </View>
              )}
            </View>
          </Pressable>
        </Link>
        <Link href="/driver/dispatch" asChild>
          <Pressable style={styles.tile}>
            <View style={styles.tileRow}>
              <Text style={styles.tileText}>Dispatch</Text>
              {pendingDispatchCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingDispatchCount}</Text>
                </View>
              )}
            </View>
          </Pressable>
        </Link>
        <Link href={{ pathname: '/driver/inventory', params: { mode: 'closing' } }} asChild>
          <Pressable style={styles.tile}>
            <Text style={styles.tileText}>Cierre</Text>
          </Pressable>
        </Link>
      </View>

      <Link href="/driver/my-sales" asChild>
        <Pressable style={styles.textLink}>
          <Text style={styles.textLinkText}>Mis ventas</Text>
        </Pressable>
      </Link>

      <View style={styles.footerRow}>
        <Pressable onPress={end} disabled={shiftBusy}>
          <Text style={styles.footerLink}>{shiftBusy ? 'Finalizando…' : 'Finalizar turno'}</Text>
        </Pressable>
        <Pressable onPress={signOut}>
          <Text style={styles.footerLink}>Cerrar sesión</Text>
        </Pressable>
      </View>
      {shiftActionError ? <Text style={styles.error}>{shiftActionError}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  greeting: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.lg },

  heroContainer: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center', alignItems: 'stretch' },
  heroGreeting: { ...typography.largeTitle, color: colors.textPrimary, textAlign: 'center' },
  heroSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xxl },
  heroButton: { backgroundColor: colors.primary, borderRadius: radii.xl, paddingVertical: spacing.xl, alignItems: 'center' },
  heroButtonText: { color: '#fff', fontWeight: '700', fontSize: 20 },

  statusStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { ...typography.caption, color: colors.textSecondary },
  chipValue: { ...typography.caption, fontWeight: '700' },

  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    ...softShadow,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 20 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  tileText: { color: colors.primary, fontWeight: '600', fontSize: 16 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: radii.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  textLink: { alignItems: 'center', marginTop: spacing.xl },
  textLinkText: { color: colors.primary, fontSize: 14, fontWeight: '600' },

  footerRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xl },
  footerLink: { color: colors.textSecondary, fontSize: 13 },

  error: { color: colors.danger, fontSize: 13, marginTop: spacing.md, textAlign: 'center' },

  signOutLink: { alignItems: 'center', marginTop: spacing.xxl },
  signOutLinkText: { color: colors.textSecondary, fontSize: 13 },

  scheduleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  scheduleTitle: { ...typography.subhead, color: colors.textSecondary, marginBottom: spacing.xs },
  scheduleRange: { ...typography.headline, color: colors.textPrimary, marginTop: spacing.xs },
  dayRow: { flexDirection: 'row', gap: spacing.xs },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  dayDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayDotText: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  dayDotTextActive: { color: '#fff' },
  scheduleTodayBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scheduleTodayLabel: { ...typography.caption, color: colors.warning, fontWeight: '700' },
  scheduleTodayText: { ...typography.headline, color: colors.textPrimary, marginTop: 2 },
  scheduleTodayReason: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
