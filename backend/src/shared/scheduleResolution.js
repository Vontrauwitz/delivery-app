// Pure, DB-free schedule resolution + live operational status. No I/O — callers fetch the
// driver's defaultShift, any DriverScheduleException, and any ScheduledShift for the target date
// and pass them in; this file only does the deterministic math. Mirrors the separation already
// established by shiftComparison.js (compareShift), which this module does NOT replace or modify
// — that logic keeps comparing a specific ScheduledShift against its matched WorkShift after the
// fact. This module answers a different question: "what SHOULD today look like, and how does
// right now compare to that", independent of whether a ScheduledShift was ever created.
//
// Weekday representation: ISO 8601 — 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday,
// 6=Saturday, 7=Sunday. Chosen (over JS's native 0=Sunday..6=Saturday) because the app's UI shows
// a Monday-first week (L M X J V S D) and ISO weekday numbers read the same way, left to right.

function getIsoWeekday(date) {
  const jsDay = date.getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
}

// "YYYY-MM-DD" in local calendar time — the canonical identity for "which date is this", used
// for exception lookups and as the anchor for computeShiftWindow. Never derived from UTC: a
// shift's calendar date is whatever day it is for the people running the operation.
function toDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateKeyToMidnight(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

// startTime + durationMinutes, anchored to a specific calendar date, is unambiguous by
// construction: 06:00 + 720min = 18:00 same day; 18:00 + 720min = 06:00 next day; 06:00 +
// 1440min = 06:00 next day (a clean 24h shift). No special-casing needed for overnight/24h —
// it falls out of plain date arithmetic.
function computeShiftWindow(dateKey, startTime, durationMinutes) {
  if (!isValidTime(startTime)) {
    throw new Error(`startTime inválido: ${startTime}`);
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`durationMinutes inválido: ${durationMinutes}`);
  }
  const [hours, minutes] = startTime.split(':').map(Number);
  const start = dateKeyToMidnight(dateKey);
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return { start, end };
}

// Resolution priority (highest to lowest):
//   1. scheduledShift — an explicit ScheduledShift for this date, if one exists
//   2. exception       — a DriverScheduleException for this exact date
//   3. defaultShift    — the driver's recurring pattern, if enabled, this date's ISO weekday is
//                         in activeDays, AND this date is on/after defaultShift.effectiveFrom
//                         (when set)
//   4. none            — rest day / no expected shift
//
// Inputs are already resolved to "for this date" by the caller (a DB lookup, not this function's
// concern) — this function only encodes the priority and the time math.
function resolveExpectedShift({ date, defaultShift, exception, scheduledShift }) {
  const dateKey = toDateKey(date);

  if (scheduledShift) {
    return {
      source: 'SCHEDULED_SHIFT',
      isWorkingDay: true,
      expectedStart: new Date(scheduledShift.scheduledStart),
      expectedEnd: new Date(scheduledShift.scheduledEnd),
      reason: null,
    };
  }

  if (exception) {
    if (exception.type === 'REST') {
      return { source: 'EXCEPTION', isWorkingDay: false, expectedStart: null, expectedEnd: null, reason: exception.reason || null };
    }

    // WORK never carries its own times — it only means "add this day using the normal
    // template". CUSTOM is the only type that can override startTime/durationMinutes
    // independently (either one alone falls back to the default's value for the other) — kept
    // as a distinct type from WORK precisely so the two intents ("normal day added" vs
    // "different hours on this date") stay unambiguous in the data, not just in a UI label.
    const startTime = exception.type === 'CUSTOM' && exception.startTime ? exception.startTime : defaultShift?.startTime;
    const durationMinutes =
      exception.type === 'CUSTOM' && exception.durationMinutes != null ? exception.durationMinutes : defaultShift?.durationMinutes;

    if (!isValidTime(startTime) || !Number.isFinite(durationMinutes)) {
      // A working day was requested but there's no time template to resolve against (no default
      // shift configured, or it lacks times) — still a working day, just with unknown hours
      // rather than fabricating a threshold-free guess.
      return { source: 'EXCEPTION', isWorkingDay: true, expectedStart: null, expectedEnd: null, reason: exception.reason || null };
    }

    const { start, end } = computeShiftWindow(dateKey, startTime, durationMinutes);
    return { source: 'EXCEPTION', isWorkingDay: true, expectedStart: start, expectedEnd: end, reason: exception.reason || null };
  }

  // effectiveFrom gates only this DEFAULT branch — an explicit ScheduledShift or exception for a
  // date before effectiveFrom is handled above and never reaches here. Compared as "YYYY-MM-DD"
  // strings (lexicographic order matches chronological order for this zero-padded format), never
  // as raw timestamps, so a stored midnight-of-day Date can't be shifted a day by a time-of-day
  // mismatch. No effectiveFrom at all (null/unset) means "always effective" — schedules
  // configured before this field existed keep behaving exactly as they did.
  const isEffective = !defaultShift?.effectiveFrom || dateKey >= toDateKey(new Date(defaultShift.effectiveFrom));

  if (isEffective && defaultShift?.enabled && Array.isArray(defaultShift.activeDays) && defaultShift.activeDays.includes(getIsoWeekday(date))) {
    if (!isValidTime(defaultShift.startTime) || !Number.isFinite(defaultShift.durationMinutes)) {
      return { source: 'DEFAULT', isWorkingDay: true, expectedStart: null, expectedEnd: null, reason: defaultShift.name || null };
    }
    const { start, end } = computeShiftWindow(dateKey, defaultShift.startTime, defaultShift.durationMinutes);
    return { source: 'DEFAULT', isWorkingDay: true, expectedStart: start, expectedEnd: end, reason: defaultShift.name || null };
  }

  return { source: 'NONE', isWorkingDay: false, expectedStart: null, expectedEnd: null, reason: null };
}

// How late a start / how early or late an end has to be before it stops reading as "on time".
// Deliberately generous and symmetric with SCHEDULE_MATCH_TOLERANCE_MS's spirit (real shifts
// vary a bit; only flag genuine deviations) without trying to be configurable per-driver yet.
// There is deliberately no separate "how long after starting does it still count as on time"
// window — start punctuality (startStatus) is a fixed fact about how the shift began, not
// something that decays over the course of the shift, so no such threshold exists to invent.
const LATE_START_TOLERANCE_MINUTES = 15;
const EARLY_END_TOLERANCE_MINUTES = 15;
const LATE_END_TOLERANCE_MINUTES = 15;

// Deterministic live status for a single resolved expected day, given the one WorkShift (if any)
// that represents "today" for this driver (see driverSchedule.service.findRelevantWorkShift for
// how that's picked — this function doesn't care, it just compares what it's given against now).
//
// Two independent pieces of information, returned separately rather than merged into one enum:
//   status      — CURRENT STATE: REST_DAY, NOT_STARTED, WORKING, SHOULD_HAVE_ENDED, ENDED_EARLY,
//                 ENDED_ON_TIME, ENDED_LATE. SHOULD_HAVE_ENDED always wins over WORKING once now
//                 is past the expected end, since "still working past when they should have
//                 stopped" is the more urgent fact once it's true.
//   startStatus — START PUNCTUALITY: null (no WorkShift yet) | ON_TIME | LATE_START. A fixed
//                 fact about how the shift began, independent of — and does not change with —
//                 how long the shift has been running or how it ends.
function deriveOperationalStatus({ expected, workShift, now = new Date() }) {
  if (!expected.isWorkingDay) {
    return { status: 'REST_DAY', startStatus: null, startDiffMinutes: null, endDiffMinutes: null };
  }

  if (!workShift) {
    return { status: 'NOT_STARTED', startStatus: null, startDiffMinutes: null, endDiffMinutes: null };
  }

  const actualStart = new Date(workShift.startedAt);
  const startDiffMinutes = expected.expectedStart ? Math.round((actualStart.getTime() - expected.expectedStart.getTime()) / 60000) : null;
  const startStatus = startDiffMinutes != null && startDiffMinutes > LATE_START_TOLERANCE_MINUTES ? 'LATE_START' : 'ON_TIME';

  const isOpen = !workShift.endedAt;
  if (isOpen) {
    if (expected.expectedEnd && now.getTime() > expected.expectedEnd.getTime()) {
      const endDiffMinutes = Math.round((now.getTime() - expected.expectedEnd.getTime()) / 60000);
      return { status: 'SHOULD_HAVE_ENDED', startStatus, startDiffMinutes, endDiffMinutes };
    }
    return { status: 'WORKING', startStatus, startDiffMinutes, endDiffMinutes: null };
  }

  // Closed.
  const actualEnd = new Date(workShift.endedAt);
  if (!expected.expectedEnd) {
    return { status: 'ENDED_ON_TIME', startStatus, startDiffMinutes, endDiffMinutes: null };
  }
  const endDiffMinutes = Math.round((actualEnd.getTime() - expected.expectedEnd.getTime()) / 60000);
  if (endDiffMinutes < -EARLY_END_TOLERANCE_MINUTES) {
    return { status: 'ENDED_EARLY', startStatus, startDiffMinutes, endDiffMinutes };
  }
  if (endDiffMinutes > LATE_END_TOLERANCE_MINUTES) {
    return { status: 'ENDED_LATE', startStatus, startDiffMinutes, endDiffMinutes };
  }
  return { status: 'ENDED_ON_TIME', startStatus, startDiffMinutes, endDiffMinutes };
}

module.exports = {
  getIsoWeekday,
  toDateKey,
  dateKeyToMidnight,
  computeShiftWindow,
  resolveExpectedShift,
  deriveOperationalStatus,
  isValidTime,
};
