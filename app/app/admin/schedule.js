import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/modules/auth/useAuth';
import * as usersApi from '../../src/modules/users/api';
import * as scheduledShiftsApi from '../../src/modules/scheduledShifts/api';
import * as driverScheduleApi from '../../src/modules/driverSchedule/api';
import { formatDurationMs, formatMinutesLabel } from '../../src/shared/duration';
import { getHeadlineLabel, getStatusColor, formatSignedDuration } from '../../src/shared/shiftComparison';
import { toDateKey, WEEKDAY_LETTERS } from '../../src/shared/dateKey';
import DateTimeField from '../../src/shared/DateTimeField';
import NeoCard from '../../src/modules/dashboard/NeoCard';
import { neoColors, neoSpacing, neoRadii, neoTypography } from '../../src/shared/neoTheme';

const DAY_PRESETS = [
  { label: 'Lunes a viernes', days: [1, 2, 3, 4, 5] },
  { label: 'Todos los días', days: [1, 2, 3, 4, 5, 6, 7] },
  { label: 'Fin de semana', days: [6, 7] },
];

// Presets set BOTH Inicio and Fin (time-of-day only — durationMinutes is derived from the pair,
// never stored as a preset property). Same durations as before: Mañana 12h, Tarde 10h, Noche 8h,
// 24h exactly 24h — expressed here as end times so computeDurationMinutes's own end<=start "next
// day" rule (including the equal-times 24h case) does the rest.
const TIME_PRESETS = [
  { label: 'Mañana', name: 'Mañana', startTime: '06:00', endTime: '18:00' },
  { label: 'Tarde', name: 'Tarde', startTime: '14:00', endTime: '00:00' },
  { label: 'Noche', name: 'Noche', startTime: '22:00', endTime: '06:00' },
  { label: '24h', name: '24h', startTime: '06:00', endTime: '06:00' },
];

const APPLY_FROM_OPTIONS = [
  { value: 'TODAY', label: 'Hoy' },
  { value: 'CUSTOM', label: 'Elegir fecha' },
];

const EXCEPTION_TYPES = [
  { value: 'WORK', label: 'Trabaja' },
  { value: 'REST', label: 'Descansa' },
  { value: 'CUSTOM', label: 'Horario distinto' },
];

// One place to describe every non-summary view's identity — icon, title, and the one-line
// explanation the subview header shows. Keeps the header markup itself generic (see
// SubviewHeader) instead of repeating title/description strings at each call site.
const SUBVIEW_META = {
  EDIT_DEFAULT: {
    icon: 'pencil-outline',
    title: 'Horario normal',
    description: 'Este es el horario que el chofer sigue normalmente.',
  },
  EXCEPTIONS: {
    icon: 'calendar-outline',
    title: 'Cambiar solo un día',
    description: 'Modifica únicamente esta fecha.',
  },
  SPECIAL_SHIFT: {
    icon: 'time-outline',
    title: 'Turno especial',
    description: 'Programa un turno único para una fecha específica.',
  },
  HISTORY: {
    icon: 'bar-chart-outline',
    title: 'Historial y asistencia',
    description: 'Compara lo programado con lo que realmente trabajó el chofer.',
  },
};

// DateTimeField (mode="time") deals in Date objects; defaultShift.startTime is stored/sent as a
// plain "HH:mm" string. These two converters are the only place that boundary is crossed — the
// rest of the component, and everything sent to the backend, stays on the "HH:mm" string side.
function timeStringToDate(hhmm) {
  const [h, m] = (hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '06:00').split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
}

function dateToTimeString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The manager picks Inicio/Fin as times-of-day, not a duration — this derives durationMinutes
// from the pair, the only form the backend actually stores. end<=start (including exactly
// equal) means the shift rolls into the next day, same rule as computeScheduleRange uses for
// ScheduledShift creation: end-not-after-start is never a negative/zero duration, it's tomorrow.
function computeDurationMinutes(startTime, endTime) {
  const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  let endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}

// Inverse-ish helper for initializing the Fin picker from a loaded (startTime, durationMinutes)
// pair — only the time-of-day matters, the calendar date is an arbitrary anchor (same convention
// as timeStringToDate).
function addMinutesToTimeOfDay(baseTime, minutes) {
  const totalMinutes = ((baseTime.getHours() * 60 + baseTime.getMinutes() + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const date = new Date(baseTime);
  date.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return date;
}

function formatExpectedRange(startTime, durationMinutes) {
  if (!startTime || !durationMinutes) return 'Sin horario definido';
  const [h, m] = startTime.split(':').map(Number);
  const endTotal = h * 60 + m + Number(durationMinutes);
  const endH = Math.floor((endTotal / 60) % 24);
  const endM = endTotal % 60;
  const dayOverflow = Math.floor(endTotal / (24 * 60));
  const pad = (n) => String(n).padStart(2, '0');
  const suffix = dayOverflow > 0 ? ` (+${dayOverflow}d)` : '';
  return `${startTime}–${pad(endH)}:${pad(endM)}${suffix}`;
}

// Top header for the SUMMARY view — same "← back row, then title" shape as SubviewHeader below,
// but the back destination depends on how Programación was entered rather than always being the
// dashboard: Driver detail > Horario returns to that driver; Configuración > Horarios returns to
// Configuración. That context is carried entirely in the URL (see the `from`/`driver` params
// read in ScheduleScreen), never inferred from navigation history — so it resolves the same way
// on Android, iOS, and web, and never depends on the hardware back button.
function SummaryHeader({ backLabel, onBack }) {
  return (
    <View style={styles.summaryHeader}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>{backLabel}</Text>
      </Pressable>
      <Text style={styles.summaryTitle}>Programación</Text>
    </View>
  );
}

// Top header for every subview: back action always first/topmost (never a bottom-of-form
// "Volver"), then the subview's own identity (icon + title), the selected driver as context, and
// the one-line explanation. This is the only back-navigation affordance inside a subview — there
// is no separate "Panel" competing with it here.
function SubviewHeader({ view, driverName, onBack }) {
  const meta = SUBVIEW_META[view];
  return (
    <View style={styles.subviewHeader}>
      <Pressable style={styles.backRow} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={18} color={neoColors.primary} />
        <Text style={styles.backRowText}>Programación</Text>
      </Pressable>
      <View style={styles.subviewTitleRow}>
        <Ionicons name={meta.icon} size={20} color={neoColors.ink} />
        <Text style={styles.subviewTitle}>{meta.title}</Text>
      </View>
      {!!driverName && <Text style={styles.subviewDriver}>{driverName}</Text>}
      <Text style={styles.subviewDescription}>{meta.description}</Text>
    </View>
  );
}

// Compact select-style control instead of a chip row: as the driver list grows past a handful,
// a wrapping chip row either overflows horizontally or grows tall enough to push everything else
// down the screen. A single tappable field + modal list stays a fixed, small size regardless of
// driver count, scrolls internally instead of the page growing, and gives one obvious "this is
// who's selected" readout at a glance — the same tradeoff a native <select> makes over a button
// per option.
function DriverPicker({ drivers, selectedDriverId, onSelect }) {
  const [open, setOpen] = useState(false);
  const selected = drivers.find((d) => d._id === selectedDriverId);

  return (
    <>
      <Pressable style={styles.driverSelect} onPress={() => setOpen(true)}>
        <Text style={styles.driverSelectText} numberOfLines={1}>
          {selected ? selected.name : 'Selecciona un chofer'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={neoColors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          {/* An empty onPress here claims the touch so tapping inside the sheet doesn't bubble
              up to the backdrop's onPress and close the modal along with it. */}
          <Pressable onPress={() => {}} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Chofer</Text>
            <ScrollView style={styles.modalList}>
              {drivers.map((d) => {
                const isSelected = d._id === selectedDriverId;
                return (
                  <Pressable
                    key={d._id}
                    style={[styles.modalRow, isSelected && styles.modalRowActive]}
                    onPress={() => {
                      onSelect(d._id);
                      setOpen(false);
                    }}
                  >
                    <Text style={[styles.modalRowText, isSelected && styles.modalRowTextActive]}>{d.name}</Text>
                    {isSelected && <Ionicons name="checkmark" size={18} color={neoColors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// One tappable row per entry point (Cambiar solo un día / Turno especial / Historial y
// asistencia) — a vertical list of business actions rather than three forms competing for
// attention on the same screen.
function ActionRow({ icon, label, onPress }) {
  return (
    <NeoCard onPress={onPress} style={styles.actionRowWrap} contentStyle={styles.actionRowContent}>
      <View style={styles.actionRowLeft}>
        <Ionicons name={icon} size={18} color={neoColors.primary} />
        <Text style={styles.actionRowText}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={neoColors.textTertiary} />
    </NeoCard>
  );
}

// Compact, read-only readout of the driver's recurring pattern — the only thing visible by
// default. Editing the actual fields only ever happens behind "Editar horario", never here.
function HorarioNormalSummary({ driver, onEdit }) {
  const shift = driver?.defaultShift;
  const enabled = !!shift?.enabled;

  return (
    <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Horario normal</Text>
        <View style={[styles.toggle, enabled && styles.toggleActive]}>
          <Text style={[styles.toggleText, enabled && styles.toggleTextActive]}>{enabled ? 'Activo' : 'Inactivo'}</Text>
        </View>
      </View>

      {enabled ? (
        <>
          <View style={styles.dayRow}>
            {WEEKDAY_LETTERS.map((letter, idx) => {
              const isoDay = idx + 1;
              const active = (shift.activeDays || []).includes(isoDay);
              return (
                <View key={isoDay} style={[styles.dayChip, active && styles.dayChipActive]}>
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{letter}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.metaLine}>{formatExpectedRange(shift.startTime, shift.durationMinutes)}</Text>
          {!!shift.name && <Text style={styles.metaLine}>{shift.name}</Text>}
        </>
      ) : (
        <Text style={styles.empty}>Sin horario normal configurado.</Text>
      )}

      <Pressable style={styles.editLink} onPress={onEdit}>
        <Ionicons name="pencil-outline" size={14} color={neoColors.primary} />
        <Text style={styles.editLinkText}>Editar horario</Text>
      </Pressable>
    </NeoCard>
  );
}

function DefaultShiftEditor({ driver, token, onSaved }) {
  const [name, setName] = useState('');
  // Always real Dates — DateTimeField has no "empty" state, mirroring the ScheduledShift
  // pickers. durationMinutes is never stored as its own field here anymore; it's derived from
  // (startTime, endTime) at save time via computeDurationMinutes.
  const [startTime, setStartTime] = useState(() => timeStringToDate('06:00'));
  const [endTime, setEndTime] = useState(() => timeStringToDate('18:00'));
  const [activeDays, setActiveDays] = useState([]);
  const [enabled, setEnabled] = useState(false);
  // "Aplicar desde": TODAY always means "whatever today is at save time" (not a date frozen at
  // load time), CUSTOM pins it to effectiveFromDate. Mirrors how the ScheduledShift date picker
  // has no "unset" state — effectiveFromDate always holds a real Date even before the manager
  // touches it, ready the moment they switch to "Elegir fecha".
  const [applyFrom, setApplyFrom] = useState('TODAY');
  const [effectiveFromDate, setEffectiveFromDate] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  // Shown for a couple seconds right after a successful save — the button's only visible
  // confirmation that anything happened, since it otherwise just flips straight back to its
  // normal label with nothing to signal success. Cleared on unmount/driver-change so it can never
  // fire (or linger) against a screen the manager has already navigated away from.
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState('');
  const successTimeoutRef = useRef(null);

  useEffect(() => {
    const shift = driver?.defaultShift || {};
    setName(shift.name || '');
    const loadedStart = timeStringToDate(shift.startTime);
    setStartTime(loadedStart);
    setEndTime(shift.durationMinutes != null ? addMinutesToTimeOfDay(loadedStart, shift.durationMinutes) : timeStringToDate('18:00'));
    setActiveDays(shift.activeDays || []);
    setEnabled(!!shift.enabled);
    if (shift.effectiveFrom) {
      setApplyFrom('CUSTOM');
      setEffectiveFromDate(new Date(shift.effectiveFrom));
    } else {
      setApplyFrom('TODAY');
      setEffectiveFromDate(new Date());
    }
    setError('');
    clearTimeout(successTimeoutRef.current);
    setJustSaved(false);
  }, [driver?._id]);

  useEffect(() => () => clearTimeout(successTimeoutRef.current), []);

  function toggleDay(isoDay) {
    setActiveDays((current) => (current.includes(isoDay) ? current.filter((d) => d !== isoDay) : [...current, isoDay].sort()));
  }

  async function handleSave() {
    setError('');
    if (enabled && activeDays.length === 0) {
      setError('Selecciona al menos un día de trabajo');
      return;
    }
    setSaving(true);
    try {
      await driverScheduleApi.updateDefaultShift(token, driver._id, {
        name,
        // startTime always comes from the picker as a valid Date now, so there's no "empty
        // string" case left to guard — the only thing crossing the wire is the HH:mm string.
        startTime: dateToTimeString(startTime),
        durationMinutes: computeDurationMinutes(startTime, endTime),
        activeDays: enabled ? activeDays : activeDays.length ? activeDays : undefined,
        effectiveFrom: toDateKey(applyFrom === 'TODAY' ? new Date() : effectiveFromDate),
        enabled,
      });
      setSaving(false);
      setJustSaved(true);
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setJustSaved(false), 1800);
      onSaved?.();
    } catch {
      // Edits are left exactly as the manager entered them — only a save attempt is retried,
      // never a re-render from scratch.
      setError('No se pudo guardar el horario. Intenta de nuevo.');
      setSaving(false);
    }
  }

  return (
    <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardEyebrow}>Estado</Text>
        <Pressable style={[styles.toggle, enabled && styles.toggleActive]} onPress={() => setEnabled((v) => !v)}>
          <Text style={[styles.toggleText, enabled && styles.toggleTextActive]}>{enabled ? 'Activo' : 'Inactivo'}</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Plantilla</Text>
      <View style={styles.chipRow}>
        {TIME_PRESETS.map((preset) => (
          <Pressable
            key={preset.label}
            style={styles.presetChip}
            onPress={() => {
              setName(preset.name);
              setStartTime(timeStringToDate(preset.startTime));
              setEndTime(timeStringToDate(preset.endTime));
              setEnabled(true);
            }}
          >
            <Text style={styles.presetChipText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Nombre (opcional)</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ej. Turno mañana" placeholderTextColor={neoColors.textTertiary} />

      <Text style={styles.label}>Aplicar desde</Text>
      <View style={styles.chipRow}>
        {APPLY_FROM_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.chip, applyFrom === option.value && styles.chipActive]}
            onPress={() => setApplyFrom(option.value)}
          >
            <Text style={[styles.chipText, applyFrom === option.value && styles.chipTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      {applyFrom === 'CUSTOM' && <DateTimeField mode="date" value={effectiveFromDate} onChange={setEffectiveFromDate} style={{ marginTop: neoSpacing.sm }} />}

      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <Text style={styles.label}>Inicio</Text>
          <DateTimeField mode="time" value={startTime} onChange={setStartTime} />
        </View>
        <View style={styles.timeCol}>
          <Text style={styles.label}>Fin</Text>
          <DateTimeField mode="time" value={endTime} onChange={setEndTime} />
        </View>
      </View>
      <Text style={styles.metaLine}>Horario: {formatExpectedRange(dateToTimeString(startTime), computeDurationMinutes(startTime, endTime))}</Text>

      <Text style={styles.label}>Días de trabajo</Text>
      <View style={styles.chipRow}>
        {DAY_PRESETS.map((preset) => (
          <Pressable key={preset.label} style={styles.presetChip} onPress={() => setActiveDays(preset.days)}>
            <Text style={styles.presetChipText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.dayRow}>
        {WEEKDAY_LETTERS.map((letter, idx) => {
          const isoDay = idx + 1;
          const active = activeDays.includes(isoDay);
          return (
            <Pressable key={isoDay} style={[styles.dayChip, active && styles.dayChipActive]} onPress={() => toggleDay(isoDay)}>
              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{letter}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.createButton, justSaved && styles.createButtonSuccess]} onPress={handleSave} disabled={saving}>
        {saving ? (
          <View style={styles.savingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.createButtonText}>Guardando...</Text>
          </View>
        ) : justSaved ? (
          <Text style={styles.createButtonText}>✓ Horario guardado</Text>
        ) : (
          <Text style={styles.createButtonText}>Guardar horario normal</Text>
        )}
      </Pressable>
    </NeoCard>
  );
}

function ExceptionCard({ exception, onDelete }) {
  const typeLabel = EXCEPTION_TYPES.find((t) => t.value === exception.type)?.label || exception.type;
  return (
    <NeoCard accentColor={neoColors.primary} style={styles.cardWrap} contentStyle={styles.cardBody}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{exception.dateKey}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{typeLabel}</Text>
        </View>
      </View>
      {exception.type === 'CUSTOM' && (exception.startTime || exception.durationMinutes) && (
        <Text style={styles.metaLine}>
          {exception.startTime || '(hora habitual)'}
          {exception.durationMinutes ? ` · ${exception.durationMinutes} min` : ''}
        </Text>
      )}
      {!!exception.reason && <Text style={styles.metaLine}>{exception.reason}</Text>}
      <Pressable style={styles.deleteLink} onPress={() => onDelete(exception._id)}>
        <Text style={styles.deleteLinkText}>Eliminar excepción</Text>
      </Pressable>
    </NeoCard>
  );
}

// Merges dateValue's calendar date with timeValue's hours/minutes into one Date — used to turn
// the three separate pickers (one shared date, one start time-of-day, one end time-of-day) into
// the two real moments in time ScheduledShift actually stores.
function combineDateAndTime(dateValue, timeValue) {
  const combined = new Date(dateValue);
  combined.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
  return combined;
}

// If the end time-of-day is not strictly after the start time-of-day, the shift rolls into the
// next calendar day — this is what makes 18:00->06:00 (overnight) and 06:00->06:00 (a clean 24h
// shift) both resolve correctly without the manager ever picking two different dates.
function computeScheduleRange(dateValue, startTimeValue, endTimeValue) {
  const start = combineDateAndTime(dateValue, startTimeValue);
  let end = combineDateAndTime(dateValue, endTimeValue);
  const overnight = end.getTime() <= start.getTime();
  if (overnight) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, overnight };
}

function capitalize(text) {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
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
    <NeoCard accentColor={statusColor} style={styles.cardWrap} contentStyle={styles.cardBody}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{scheduledShift.driver?.name}</Text>
        <View style={styles.cardHeaderActions}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{headline}</Text>
          </View>
          {/* Quiet, icon-only — deletion here is secondary to the historical record itself, not
              a competing call to action (see the loud "Agregar excepción"-style button pattern
              used for actual primary actions elsewhere in this screen). */}
          <Pressable style={styles.historyDeleteButton} onPress={() => onDelete(scheduledShift._id)} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={neoColors.textTertiary} />
          </Pressable>
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
    </NeoCard>
  );
}

export default function ScheduleScreen() {
  const { token } = useAuth();
  const router = useRouter();
  // Optional deep-link from Driver detail ("Horario") — e.g. /admin/schedule?driver=<id>&from=driver.
  // `linkedDriverId` is only ever consulted for the very first driver selection (see load()
  // below); switching drivers afterward through the picker works exactly as before. `from`
  // ('driver' | 'settings') decides where the header's back action returns to — see
  // SummaryHeader above.
  const { driver: linkedDriverId, from: cameFrom } = useLocalSearchParams();
  const cameFromDriver = cameFrom === 'driver' && !!linkedDriverId;
  const [drivers, setDrivers] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedDriverId, setSelectedDriverId] = useState(null);
  // Progressive disclosure: the initial view is just a compact summary + three entry points —
  // only one of these five views is ever rendered at a time. 'SUMMARY' | 'EDIT_DEFAULT' |
  // 'EXCEPTIONS' | 'SPECIAL_SHIFT' | 'HISTORY'.
  const [activeView, setActiveView] = useState('SUMMARY');
  // One shared calendar date + two independent time-of-day values — see computeScheduleRange for
  // how these become the actual scheduledStart/scheduledEnd, including the overnight rollover.
  const [scheduleDate, setScheduleDate] = useState(() => new Date());
  const [scheduleStartTime, setScheduleStartTime] = useState(() => new Date());
  const [scheduleEndTime, setScheduleEndTime] = useState(() => new Date(Date.now() + 8 * 60 * 60 * 1000));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [exceptions, setExceptions] = useState([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [excDate, setExcDate] = useState(() => new Date());
  const [excType, setExcType] = useState('WORK');
  const [excStartTime, setExcStartTime] = useState('');
  const [excDurationMinutes, setExcDurationMinutes] = useState('');
  const [excReason, setExcReason] = useState('');
  const [excCreating, setExcCreating] = useState(false);
  const [excError, setExcError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [users, comparisonsData] = await Promise.all([usersApi.listUsers(token), scheduledShiftsApi.listComparisons(token)]);
      const driverUsers = users.filter((u) => u.role === 'driver');
      setDrivers(driverUsers);
      if (driverUsers.length > 0) {
        const linked = driverUsers.some((d) => d._id === linkedDriverId) ? linkedDriverId : null;
        setSelectedDriverId((current) => current || linked || driverUsers[0]._id);
      }
      setComparisons(comparisonsData);
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la programación');
    } finally {
      setLoading(false);
    }
  }, [token, linkedDriverId]);

  useEffect(() => {
    load();
  }, [load]);

  // New-shift defaults: the selected driver's own habitual duration when their default schedule
  // is enabled, otherwise a temporary +8h — never a blank field the manager has to fill in from
  // nothing.
  const resetScheduleDefaults = useCallback(
    (driverId) => {
      const driver = drivers.find((d) => d._id === driverId);
      const durationMinutes = driver?.defaultShift?.enabled && driver.defaultShift.durationMinutes ? driver.defaultShift.durationMinutes : 8 * 60;
      const now = new Date();
      setScheduleDate(now);
      setScheduleStartTime(now);
      setScheduleEndTime(new Date(now.getTime() + durationMinutes * 60000));
    },
    [drivers]
  );

  // Recomputed only when the selected driver actually changes — not on every background
  // refresh, which would otherwise wipe out a date/time the manager is mid-editing.
  useEffect(() => {
    if (!selectedDriverId) return;
    resetScheduleDefaults(selectedDriverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriverId]);

  // Switching drivers always drops back to the compact summary — never leaves the manager
  // stranded mid-form (e.g. "Cambiar solo un día") looking at a different driver's data.
  useEffect(() => {
    setActiveView('SUMMARY');
  }, [selectedDriverId]);

  const loadExceptions = useCallback(async () => {
    if (!selectedDriverId) return;
    setExceptionsLoading(true);
    try {
      const from = toDateKey(new Date());
      const data = await driverScheduleApi.listExceptions(token, { driver: selectedDriverId, from });
      setExceptions(data);
    } catch (err) {
      setExcError(err.message || 'No se pudieron cargar las excepciones');
    } finally {
      setExceptionsLoading(false);
    }
  }, [token, selectedDriverId]);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  async function handleCreateException() {
    setExcError('');
    // excDate is a real Date from the shared picker (no raw text to validate) — toDateKey turns
    // it into the exact local-calendar "YYYY-MM-DD" the backend expects, the same local-safe
    // conversion used everywhere else in this module (see shared/dateKey.js / driverSchedule's
    // resolution logic), never a UTC-parsed string.
    const body = { driver: selectedDriverId, date: toDateKey(excDate), type: excType, reason: excReason };
    if (excType === 'CUSTOM') {
      if (excStartTime) body.startTime = excStartTime;
      if (excDurationMinutes) body.durationMinutes = Number(excDurationMinutes);
      if (!excStartTime && !excDurationMinutes) {
        setExcError('Una excepción de horario distinto necesita al menos la hora de inicio o la duración');
        return;
      }
    }
    setExcCreating(true);
    try {
      await driverScheduleApi.createException(token, body);
      setExcDate(new Date());
      setExcStartTime('');
      setExcDurationMinutes('');
      setExcReason('');
      await loadExceptions();
    } catch (err) {
      setExcError(err.message || 'No se pudo crear la excepción');
    } finally {
      setExcCreating(false);
    }
  }

  async function handleDeleteException(id) {
    try {
      await driverScheduleApi.deleteException(token, id);
      await loadExceptions();
    } catch (err) {
      setExcError(err.message || 'No se pudo eliminar la excepción');
    }
  }

  async function handleCreate() {
    setCreateError('');
    if (!selectedDriverId) {
      setCreateError('Selecciona un chofer');
      return;
    }
    // No raw ISO typing to validate, and no invalid range is reachable through the pickers:
    // computeScheduleRange always produces end > start by construction (same day, or rolled to
    // the next day when the end time-of-day isn't strictly after the start).
    const { start, end } = computeScheduleRange(scheduleDate, scheduleStartTime, scheduleEndTime);
    setCreating(true);
    try {
      await scheduledShiftsApi.createScheduledShift(token, {
        driver: selectedDriverId,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      });
      resetScheduleDefaults(selectedDriverId);
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

  // Resolved once per render from the URL context alone (never from navigation history), so it
  // works identically regardless of platform or how the screen was actually reached in practice.
  const linkedDriver = drivers.find((d) => d._id === linkedDriverId);
  const backHref = cameFromDriver ? `/admin/drivers/${linkedDriverId}` : '/admin/settings';
  const backLabel = cameFromDriver ? linkedDriver?.name || 'Chofer' : 'Configuración';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* SUMMARY-only chrome: a subview shows nothing above its own SubviewHeader, so there is
          never a second "Programación" title or a driver picker competing with "← Programación". */}
      {activeView === 'SUMMARY' && (
        <>
          <SummaryHeader backLabel={backLabel} onBack={() => router.replace(backHref)} />

          {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

          <Text style={styles.label}>Chofer</Text>
          <DriverPicker drivers={drivers} selectedDriverId={selectedDriverId} onSelect={setSelectedDriverId} />
          {drivers.length === 0 && !loading && <Text style={styles.empty}>No hay choferes registrados.</Text>}
        </>
      )}

      {selectedDriverId && (() => {
        const selectedDriver = drivers.find((d) => d._id === selectedDriverId);
        const backToSummary = () => setActiveView('SUMMARY');

        if (activeView === 'EDIT_DEFAULT') {
          return (
            <>
              <SubviewHeader view="EDIT_DEFAULT" driverName={selectedDriver?.name} onBack={backToSummary} />
              <DefaultShiftEditor driver={selectedDriver} token={token} onSaved={load} />
            </>
          );
        }

        if (activeView === 'EXCEPTIONS') {
          return (
            <>
              <SubviewHeader view="EXCEPTIONS" driverName={selectedDriver?.name} onBack={backToSummary} />
              <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
                <Text style={styles.label}>Fecha exacta</Text>
                <DateTimeField mode="date" value={excDate} onChange={setExcDate} />
                <Text style={styles.label}>Tipo</Text>
                <View style={styles.chipRow}>
                  {EXCEPTION_TYPES.map((t) => (
                    <Pressable key={t.value} style={[styles.chip, excType === t.value && styles.chipActive]} onPress={() => setExcType(t.value)}>
                      <Text style={[styles.chipText, excType === t.value && styles.chipTextActive]}>{t.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {excType === 'CUSTOM' && (
                  <>
                    <Text style={styles.label}>Hora de inicio (opcional — si se omite usa el horario habitual)</Text>
                    <TextInput
                      style={styles.input}
                      value={excStartTime}
                      onChangeText={setExcStartTime}
                      placeholder="08:00"
                      placeholderTextColor={neoColors.textTertiary}
                    />
                    <Text style={styles.label}>Duración en minutos (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      value={excDurationMinutes}
                      onChangeText={setExcDurationMinutes}
                      placeholder="480"
                      keyboardType="numeric"
                      placeholderTextColor={neoColors.textTertiary}
                    />
                  </>
                )}
                <Text style={styles.label}>Motivo (opcional)</Text>
                <TextInput style={styles.input} value={excReason} onChangeText={setExcReason} placeholder="Ej. cobertura especial" placeholderTextColor={neoColors.textTertiary} />

                {excError ? <Text style={styles.error}>{excError}</Text> : null}
                <Pressable style={styles.createButton} onPress={handleCreateException} disabled={excCreating}>
                  {excCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Guardar cambio</Text>}
                </Pressable>
              </NeoCard>

              {exceptionsLoading ? (
                <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
              ) : exceptions.length === 0 ? (
                <Text style={styles.empty}>No hay cambios programados para este chofer.</Text>
              ) : (
                exceptions.map((exc) => <ExceptionCard key={exc._id} exception={exc} onDelete={handleDeleteException} />)
              )}
            </>
          );
        }

        if (activeView === 'SPECIAL_SHIFT') {
          const { start, end, overnight } = computeScheduleRange(scheduleDate, scheduleStartTime, scheduleEndTime);
          const dayLabel = capitalize(start.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }));
          const timeFmt = (d) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
          const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
          return (
            <>
              <SubviewHeader view="SPECIAL_SHIFT" driverName={selectedDriver?.name} onBack={backToSummary} />
              <NeoCard style={styles.cardWrap} contentStyle={styles.cardBody}>
                <Text style={styles.label}>Fecha</Text>
                <DateTimeField mode="date" value={scheduleDate} onChange={setScheduleDate} />

                <View style={styles.timeRow}>
                  <View style={styles.timeCol}>
                    <Text style={styles.label}>Hora de inicio</Text>
                    <DateTimeField mode="time" value={scheduleStartTime} onChange={setScheduleStartTime} />
                  </View>
                  <View style={styles.timeCol}>
                    <Text style={styles.label}>Hora de fin</Text>
                    <DateTimeField mode="time" value={scheduleEndTime} onChange={setScheduleEndTime} />
                  </View>
                </View>

                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Resumen del turno</Text>
                  <Text style={styles.summaryText}>
                    {dayLabel} · {timeFmt(start)} → {timeFmt(end)}
                    {overnight ? ' (día siguiente)' : ''}
                  </Text>
                  <Text style={styles.summaryMeta}>Duración: {formatMinutesLabel(durationMinutes)}</Text>
                </View>

                {createError ? <Text style={styles.error}>{createError}</Text> : null}
                <Pressable style={styles.createButton} onPress={handleCreate} disabled={creating}>
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Programar turno</Text>}
                </Pressable>
              </NeoCard>
            </>
          );
        }

        if (activeView === 'HISTORY') {
          return (
            <>
              <SubviewHeader view="HISTORY" driverName={selectedDriver?.name} onBack={backToSummary} />
              {loading ? (
                <ActivityIndicator color={neoColors.primary} style={{ marginTop: neoSpacing.md }} />
              ) : comparisons.length === 0 ? (
                <Text style={styles.empty}>Todavía no hay turnos programados.</Text>
              ) : (
                comparisons.map((item) => <ComparisonCard key={item.scheduledShift._id} item={item} onDelete={handleDelete} />)
              )}
            </>
          );
        }

        // 'SUMMARY' — the default: compact readout + entry points only, no form visible.
        return (
          <>
            <HorarioNormalSummary driver={selectedDriver} onEdit={() => setActiveView('EDIT_DEFAULT')} />
            <ActionRow icon="calendar-outline" label="Cambiar solo un día" onPress={() => setActiveView('EXCEPTIONS')} />
            <ActionRow icon="time-outline" label="Turno especial" onPress={() => setActiveView('SPECIAL_SHIFT')} />
            <ActionRow icon="bar-chart-outline" label="Historial y asistencia" onPress={() => setActiveView('HISTORY')} />
          </>
        );
      })()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neoColors.background },
  content: { padding: neoSpacing.lg, paddingBottom: neoSpacing.xxl },

  summaryHeader: { marginBottom: neoSpacing.lg },
  summaryTitle: { ...neoTypography.title, color: neoColors.ink },

  subviewHeader: { marginBottom: neoSpacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: neoSpacing.md },
  backRowText: { color: neoColors.primary, fontWeight: '700', fontSize: 14 },
  subviewTitleRow: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.xs },
  subviewTitle: { ...neoTypography.title, fontSize: 20, color: neoColors.ink },
  subviewDriver: { ...neoTypography.caption, color: neoColors.primary, marginTop: 2 },
  subviewDescription: { ...neoTypography.body, color: neoColors.textSecondary, marginTop: neoSpacing.xs },

  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: neoSpacing.md },
  editLinkText: { color: neoColors.primary, fontWeight: '700', fontSize: 13 },

  actionRowWrap: { width: '100%' },
  actionRowContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: neoSpacing.md },
  actionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm },
  actionRowText: { ...neoTypography.body, color: neoColors.ink, fontWeight: '700' },

  error: { color: neoColors.danger, fontWeight: '700', marginBottom: neoSpacing.sm },
  empty: { color: neoColors.textSecondary, marginTop: neoSpacing.sm },
  label: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary, marginBottom: neoSpacing.xs, marginTop: neoSpacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: neoSpacing.sm },
  chip: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: neoSpacing.sm },
  chipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  chipText: { color: neoColors.ink, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  driverSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: neoColors.ink,
    borderRadius: neoRadii.md,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.md,
    backgroundColor: neoColors.surface,
    marginBottom: neoSpacing.lg,
  },
  driverSelectText: { ...neoTypography.body, fontWeight: '700', color: neoColors.ink, flex: 1 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: neoColors.surface,
    borderTopLeftRadius: neoRadii.xl,
    borderTopRightRadius: neoRadii.xl,
    borderTopWidth: 2,
    borderColor: neoColors.ink,
    paddingTop: neoSpacing.lg,
    paddingBottom: neoSpacing.xl,
    paddingHorizontal: neoSpacing.lg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '70%',
    alignSelf: 'center',
  },
  modalTitle: { ...neoTypography.headline, color: neoColors.ink, marginBottom: neoSpacing.sm },
  modalList: { maxHeight: 360 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: neoSpacing.md,
    paddingHorizontal: neoSpacing.sm,
    borderRadius: neoRadii.sm,
    borderBottomWidth: 1,
    borderBottomColor: neoColors.neutralMuted,
  },
  modalRowActive: { backgroundColor: neoColors.primaryMuted },
  modalRowText: { ...neoTypography.body, color: neoColors.ink },
  modalRowTextActive: { color: neoColors.primary, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: neoSpacing.md },
  timeCol: { flex: 1 },
  summaryBox: {
    marginTop: neoSpacing.sm,
    padding: neoSpacing.sm,
    borderRadius: neoRadii.md,
    backgroundColor: neoColors.neutralMuted,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: neoColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  summaryText: { fontSize: 14, fontWeight: '700', color: neoColors.ink },
  summaryMeta: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 1 },
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
  createButton: { backgroundColor: neoColors.primary, borderRadius: neoRadii.md, paddingVertical: neoSpacing.md, alignItems: 'center', marginTop: neoSpacing.md },
  createButtonSuccess: { backgroundColor: neoColors.success },
  createButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: neoSpacing.sm },

  cardWrap: { marginBottom: neoSpacing.md },
  cardBody: { padding: neoSpacing.md },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: neoSpacing.xs },
  cardTitle: { fontSize: 15, fontWeight: '800', color: neoColors.ink },
  cardEyebrow: { ...neoTypography.headline, fontSize: 12, color: neoColors.textSecondary },
  statusPill: { borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.sm, paddingVertical: 4, backgroundColor: neoColors.primaryMuted },
  statusPillText: { fontSize: 12, fontWeight: '800', color: neoColors.primary },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: neoSpacing.sm },
  historyDeleteButton: { padding: 2 },
  rangeLine: { ...neoTypography.body, color: neoColors.ink, fontWeight: '700', marginTop: neoSpacing.xs },
  metaLine: { ...neoTypography.caption, color: neoColors.textSecondary, marginTop: 2 },
  diffLine: { fontSize: 15, fontWeight: '800', marginTop: neoSpacing.xs },
  deleteLink: { alignSelf: 'flex-start', marginTop: neoSpacing.sm },
  deleteLinkText: { color: neoColors.danger, fontSize: 12, fontWeight: '700' },

  toggle: { borderWidth: 2, borderColor: neoColors.ink, borderRadius: neoRadii.full, paddingHorizontal: neoSpacing.md, paddingVertical: 4 },
  toggleActive: { backgroundColor: neoColors.successMuted, borderColor: neoColors.success },
  toggleText: { fontSize: 12, fontWeight: '800', color: neoColors.textSecondary },
  toggleTextActive: { color: neoColors.success },

  presetChip: {
    borderWidth: 2,
    borderColor: neoColors.neutral,
    borderRadius: neoRadii.full,
    paddingHorizontal: neoSpacing.md,
    paddingVertical: neoSpacing.xs,
    backgroundColor: neoColors.neutralMuted,
  },
  presetChipText: { color: neoColors.textSecondary, fontSize: 12, fontWeight: '700' },

  dayRow: { flexDirection: 'row', gap: neoSpacing.xs, marginTop: neoSpacing.sm },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: neoRadii.full,
    borderWidth: 2,
    borderColor: neoColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neoColors.surface,
  },
  dayChipActive: { backgroundColor: neoColors.primary, borderColor: neoColors.primary },
  dayChipText: { color: neoColors.textSecondary, fontWeight: '800' },
  dayChipTextActive: { color: '#fff' },
});
