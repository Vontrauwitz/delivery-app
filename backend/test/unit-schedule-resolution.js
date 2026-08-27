// Pure, DB-free unit tests for shared/scheduleResolution.js — resolution priority
// (ScheduledShift > DriverScheduleException > default schedule > rest day) and the live
// operational status derivation. No DB, no HTTP — see test/e2e-driver-schedule.js for the
// endpoint-level coverage (manager-only edits, audit trail, etc.).
//
// Usage: node test/unit-schedule-resolution.js (or: npm run test:unit:schedule-resolution)

const assert = require('assert');
const { resolveExpectedShift, deriveOperationalStatus, computeShiftWindow, getIsoWeekday } = require('../src/shared/scheduleResolution');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

const MIN = 60 * 1000;
const H = 60 * MIN;

// A Wednesday, chosen so activeDays tests are unambiguous. ISO weekday 3.
const WEDNESDAY = new Date(2026, 0, 7); // 2026-01-07 is a Wednesday
check(getIsoWeekday(WEDNESDAY) === 3, `sanity: 2026-01-07 is ISO weekday 3 (Wednesday), got ${getIsoWeekday(WEDNESDAY)}`);
const THURSDAY = new Date(2026, 0, 8);
check(getIsoWeekday(THURSDAY) === 4, 'sanity: 2026-01-08 is ISO weekday 4 (Thursday)');

// --- computeShiftWindow: recurring 06:00-18:00 (same-day) ---
{
  const { start, end } = computeShiftWindow('2026-01-07', '06:00', 720);
  check(start.getHours() === 6 && start.getMinutes() === 0, 'recurring 06:00-18:00: start is 06:00');
  check(end.getHours() === 18 && end.getMinutes() === 0, 'recurring 06:00-18:00: end is 18:00');
  check(end.toDateString() === start.toDateString(), 'recurring 06:00-18:00: end is same calendar day as start');
  check(end.getTime() - start.getTime() === 12 * H, 'recurring 06:00-18:00: duration is exactly 12h');
}

// --- computeShiftWindow: overnight 18:00-06:00 next day ---
{
  const { start, end } = computeShiftWindow('2026-01-07', '18:00', 720);
  check(start.getHours() === 18, 'overnight 18:00-06:00: start is 18:00');
  check(end.getHours() === 6, 'overnight 18:00-06:00: end is 06:00');
  check(end.getDate() === start.getDate() + 1, 'overnight 18:00-06:00: end rolls to the next calendar day');
}

// --- computeShiftWindow: 24h shift 06:00-06:00 next day, unambiguous by construction ---
{
  const { start, end } = computeShiftWindow('2026-01-07', '06:00', 1440);
  check(end.getTime() - start.getTime() === 24 * H, '24h shift: duration is exactly 24h, not treated as 0');
  check(end.getHours() === 6 && end.getDate() === start.getDate() + 1, '24h shift: 06:00 next day, not same-day 06:00');
}

// --- resolveExpectedShift: default schedule, active day ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] };
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception: null, scheduledShift: null });
  check(result.source === 'DEFAULT', 'default schedule on an active day resolves to source DEFAULT');
  check(result.isWorkingDay === true, 'default schedule on an active day is a working day');
  check(result.expectedStart.getHours() === 6 && result.expectedEnd.getHours() === 18, 'default schedule resolves the configured 06:00-18:00 window');
}

// --- resolveExpectedShift: default schedule, rest day (activeDays doesn't include today) ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 4, 5] }; // no Wed (3)
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception: null, scheduledShift: null });
  check(result.source === 'NONE', 'a day outside activeDays resolves to source NONE');
  check(result.isWorkingDay === false, 'a day outside activeDays is a rest day');
  check(result.expectedStart === null && result.expectedEnd === null, 'a rest day has no expected start/end');
}

// --- resolveExpectedShift: defaultShift.effectiveFrom gates only the DEFAULT branch ---
{
  const defaultShift = {
    enabled: true,
    startTime: '06:00',
    durationMinutes: 720,
    activeDays: [1, 2, 3, 4, 5],
    effectiveFrom: new Date(2026, 0, 12), // a Monday (in activeDays) — after WEDNESDAY (2026-01-07)
  };
  const before = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception: null, scheduledShift: null });
  check(before.source === 'NONE', `a date before effectiveFrom does not resolve via DEFAULT (got ${before.source})`);
  check(before.isWorkingDay === false, 'a date before effectiveFrom is treated as a rest day, not a fabricated working day');

  const onDate = resolveExpectedShift({ date: new Date(2026, 0, 12), defaultShift, exception: null, scheduledShift: null });
  check(onDate.source === 'DEFAULT', 'the effectiveFrom date itself DOES resolve via DEFAULT (on/after, not strictly after)');

  const after = resolveExpectedShift({ date: THURSDAY, defaultShift: { ...defaultShift, effectiveFrom: new Date(2026, 0, 1) }, exception: null, scheduledShift: null });
  check(after.source === 'DEFAULT', 'a date on/after effectiveFrom resolves normally via DEFAULT');
}

// --- resolveExpectedShift: effectiveFrom never gates ScheduledShift or exception, only DEFAULT ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5], effectiveFrom: new Date(2026, 5, 1) };
  const scheduledShift = { scheduledStart: new Date(2026, 0, 7, 9, 0), scheduledEnd: new Date(2026, 0, 7, 17, 0) };
  const withSchedule = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception: null, scheduledShift });
  check(withSchedule.source === 'SCHEDULED_SHIFT', 'an explicit ScheduledShift resolves even when the date is before defaultShift.effectiveFrom');

  const exception = { type: 'WORK' };
  const withException = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift: null });
  check(
    withException.source === 'EXCEPTION' && withException.isWorkingDay === true,
    'a WORK exception resolves (using the default template hours) even when the date is before defaultShift.effectiveFrom'
  );
}

// --- resolveExpectedShift: no effectiveFrom at all means "always effective" (pre-existing schedules) ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] }; // no effectiveFrom field
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception: null, scheduledShift: null });
  check(result.source === 'DEFAULT', 'a defaultShift with no effectiveFrom at all still resolves normally (backward compatible)');
}

// --- resolveExpectedShift: exception WORK overrides a normally-rest day ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 4, 5] }; // Wed is rest
  const exception = { type: 'WORK', reason: 'cobertura especial' };
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift: null });
  check(result.source === 'EXCEPTION', 'WORK exception on a rest day resolves to source EXCEPTION');
  check(result.isWorkingDay === true, 'WORK exception turns a rest day into a working day');
  check(result.expectedStart.getHours() === 6 && result.expectedEnd.getHours() === 18, 'WORK exception uses the driver default template (06:00-18:00), not custom hours');
}

// --- resolveExpectedShift: exception REST overrides a normally-working day ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] }; // Wed works
  const exception = { type: 'REST', reason: 'día libre' };
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift: null });
  check(result.source === 'EXCEPTION', 'REST exception on a normally-working day resolves to source EXCEPTION');
  check(result.isWorkingDay === false, 'REST exception makes a normally-working day a rest day');
}

// --- resolveExpectedShift: CUSTOM exception hours (only start overridden) ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] };
  const exception = { type: 'CUSTOM', startTime: '08:00' }; // durationMinutes falls back to default (720)
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift: null });
  check(result.expectedStart.getHours() === 8, 'CUSTOM exception with only startTime overrides just the start');
  check(result.expectedEnd.getHours() === 20, 'CUSTOM exception falls back to the default duration (720min) for the end');
}
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] };
  const exception = { type: 'CUSTOM', durationMinutes: 480 }; // startTime falls back to default (06:00)
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift: null });
  check(result.expectedStart.getHours() === 6, 'CUSTOM exception with only durationMinutes falls back to the default start (06:00)');
  check(result.expectedEnd.getHours() === 14, 'CUSTOM exception applies the overridden 8h duration (06:00-14:00)');
}

// --- resolveExpectedShift: ScheduledShift takes priority over both exception and default ---
{
  const defaultShift = { enabled: true, startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5] };
  const exception = { type: 'REST' }; // would otherwise make this a rest day
  const scheduledShift = {
    scheduledStart: new Date(2026, 0, 7, 9, 0),
    scheduledEnd: new Date(2026, 0, 7, 17, 0),
  };
  const result = resolveExpectedShift({ date: WEDNESDAY, defaultShift, exception, scheduledShift });
  check(result.source === 'SCHEDULED_SHIFT', 'an explicit ScheduledShift wins over both exception and default');
  check(result.isWorkingDay === true, 'ScheduledShift makes the day a working day even though the exception said REST');
  check(result.expectedStart.getHours() === 9 && result.expectedEnd.getHours() === 17, 'ScheduledShift times are used verbatim, not the exception/default times');
}

// --- deriveOperationalStatus: REST_DAY ---
{
  const expected = { isWorkingDay: false, expectedStart: null, expectedEnd: null };
  const result = deriveOperationalStatus({ expected, workShift: null, now: new Date(2026, 0, 7, 12, 0) });
  check(result.status === 'REST_DAY', 'a non-working day always reports REST_DAY');
}

// --- deriveOperationalStatus: NOT_STARTED (working day, no WorkShift yet) ---
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const result = deriveOperationalStatus({ expected, workShift: null, now: new Date(2026, 0, 7, 9, 0) });
  check(result.status === 'NOT_STARTED', 'a working day with no WorkShift reports NOT_STARTED, even well after the expected start');
}

// --- deriveOperationalStatus: status (current state) and startStatus (start punctuality) are
// separate fields, not merged into one enum — no arbitrary "still counts as on time for N more
// minutes" window exists anywhere in this logic. ---

// Normal shift, starts late: status is WORKING (currently working) while startStatus separately
// records LATE_START, and startStatus does not change no matter how much later "now" is checked.
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 40), endedAt: null }; // 40 min late
  const soonAfter = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 7, 0) });
  check(soonAfter.status === 'WORKING', `a shift started late is currently WORKING, not a start-punctuality value (got ${soonAfter.status})`);
  check(soonAfter.startStatus === 'LATE_START', `startStatus separately reports LATE_START (got ${soonAfter.startStatus})`);
  check(soonAfter.startDiffMinutes === 40, `startDiffMinutes reflects 40 min late (got ${soonAfter.startDiffMinutes})`);

  const hoursLater = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 15, 0) });
  check(hoursLater.status === 'WORKING', 'status stays WORKING many hours into the shift');
  check(hoursLater.startStatus === 'LATE_START', 'startStatus still reports LATE_START hours later — it is a fixed fact about how the shift began, not a decaying window');
}

// Normal shift, starts on time: status WORKING, startStatus ON_TIME, and — critically — no
// transition happens at any elapsed-time boundary (there is no 30-minute window to cross).
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 2), endedAt: null }; // 2 min late, within tolerance
  const soonAfter = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 6, 10) });
  check(soonAfter.status === 'WORKING', `right after an on-time start, status is WORKING (got ${soonAfter.status})`);
  check(soonAfter.startStatus === 'ON_TIME', `startStatus reports ON_TIME (got ${soonAfter.startStatus})`);
  const muchLater = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 12, 0) });
  check(muchLater.status === 'WORKING', `status is still WORKING well into the shift — no arbitrary transition (got ${muchLater.status})`);
  check(muchLater.startStatus === 'ON_TIME', `startStatus is unchanged at ON_TIME (got ${muchLater.startStatus})`);
}

// REST_DAY and NOT_STARTED have no start to be punctual about — startStatus is null, not a guess.
{
  const expected = { isWorkingDay: false, expectedStart: null, expectedEnd: null };
  const result = deriveOperationalStatus({ expected, workShift: null, now: new Date(2026, 0, 7, 12, 0) });
  check(result.startStatus === null, 'REST_DAY has startStatus null');
}
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const result = deriveOperationalStatus({ expected, workShift: null, now: new Date(2026, 0, 7, 9, 0) });
  check(result.startStatus === null, 'NOT_STARTED has startStatus null (no WorkShift to be punctual about yet)');
}

// --- deriveOperationalStatus: active shift past expected end -> SHOULD_HAVE_ENDED ---
// The spec's own example: expected 06:00-18:00, current time 19:10, shift still open.
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 0), endedAt: null };
  const result = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 19, 10) });
  check(result.status === 'SHOULD_HAVE_ENDED', `an open shift 1h10 past its expected end reports SHOULD_HAVE_ENDED (got ${result.status})`);
  check(result.endDiffMinutes === 70, `endDiffMinutes reflects 1h10 = 70 min over (got ${result.endDiffMinutes})`);
  check(result.status !== 'EXTENDED', 'this is a LIVE status derived while still open, not the retrospective compareShift EXTENDED status');
  check(result.startStatus === 'ON_TIME', 'SHOULD_HAVE_ENDED still separately reports startStatus (this shift started on time)');
}

// --- deriveOperationalStatus: ENDED_EARLY ---
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 0), endedAt: new Date(2026, 0, 7, 16, 30) }; // 90 min early
  const result = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 18, 30) });
  check(result.status === 'ENDED_EARLY', `ending 90 min before expected end reports ENDED_EARLY (got ${result.status})`);
  check(result.endDiffMinutes === -90, `endDiffMinutes reflects -90 (got ${result.endDiffMinutes})`);
}

// --- deriveOperationalStatus: ENDED_LATE ---
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 0), endedAt: new Date(2026, 0, 7, 18, 45) }; // 45 min late
  const result = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 19, 0) });
  check(result.status === 'ENDED_LATE', `ending 45 min after expected end reports ENDED_LATE (got ${result.status})`);
}

// --- deriveOperationalStatus: ENDED_ON_TIME (within tolerance both directions) ---
{
  const expected = { isWorkingDay: true, expectedStart: new Date(2026, 0, 7, 6, 0), expectedEnd: new Date(2026, 0, 7, 18, 0) };
  const workShift = { startedAt: new Date(2026, 0, 7, 6, 0), endedAt: new Date(2026, 0, 7, 18, 5) }; // 5 min late, within tolerance
  const result = deriveOperationalStatus({ expected, workShift, now: new Date(2026, 0, 7, 18, 10) });
  check(result.status === 'ENDED_ON_TIME', `ending 5 min after expected end (within tolerance) reports ENDED_ON_TIME (got ${result.status})`);
}

console.log('\n--- Summary ---');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
}

assert.strictEqual(failures, 0, `${failures} schedule resolution unit check(s) failed`);
