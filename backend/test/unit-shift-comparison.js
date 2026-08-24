// Pure, DB-free unit tests for the deterministic scheduled-vs-actual shift comparison
// (compareShift). No auto-close, no midnight/schedule splitting anywhere in this file — a
// WorkShift's real timestamps are never touched by this math, only compared against them.
//
// Usage: node test/unit-shift-comparison.js  (or: npm run test:unit:shift-comparison)
// No backend server or DB connection required.

const assert = require('assert');
const { compareShift } = require('../src/shared/shiftComparison');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

const H = 60 * 60 * 1000;
const MIN = 60 * 1000;

// --- No matching WorkShift at all ---
{
  const result = compareShift({
    scheduledStart: '2026-01-05T12:00:00Z',
    scheduledEnd: '2026-01-05T18:00:00Z',
    actualStart: null,
    actualEnd: null,
  });
  check(result.matched === false, 'unmatched schedule reports matched=false');
  check(result.status === 'NOT_STARTED', 'unmatched schedule status is NOT_STARTED');
}

// --- Matched, still OPEN (no actualEnd yet) ---
{
  const scheduledStart = new Date('2026-01-05T12:00:00Z');
  const actualStart = new Date(scheduledStart.getTime() - 10 * MIN); // 10 min early
  const result = compareShift({
    scheduledStart,
    scheduledEnd: new Date(scheduledStart.getTime() + 6 * H),
    actualStart,
    actualEnd: null,
  });
  check(result.matched === true, 'open shift reports matched=true');
  check(result.status === 'OPEN', 'shift with no actualEnd reports status OPEN');
  check(result.startDiffMinutes === -10, `startDiffMinutes reflects 10 min early (got ${result.startDiffMinutes})`);
  check(result.actualDurationMs > 0, 'actualDurationMs is computed against now while open');
}

// --- Closed, on time (within tolerance both ends) ---
{
  const scheduledStart = new Date('2026-01-05T12:00:00Z');
  const scheduledEnd = new Date('2026-01-05T18:00:00Z');
  const result = compareShift({
    scheduledStart,
    scheduledEnd,
    actualStart: scheduledStart,
    actualEnd: scheduledEnd,
  });
  check(result.status === 'CLOSED', 'exact on-time shift reports status CLOSED, not EXTENDED');
  check(result.startDiffMinutes === 0 && result.endDiffMinutes === 0, 'on-time shift has 0 diff at both ends');
  check(result.differenceMs === 0, 'on-time shift has 0 total difference');
}

// --- Closed, moderately late both ends — NOT extended (small overrun) ---
{
  const scheduledStart = new Date('2026-01-05T12:00:00Z');
  const scheduledEnd = new Date('2026-01-05T20:00:00Z'); // 8h scheduled
  const actualStart = new Date(scheduledStart.getTime() + 34 * MIN); // 34 min late
  const actualEnd = new Date(scheduledEnd.getTime() + 7 * MIN); // 7 min late
  const result = compareShift({ scheduledStart, scheduledEnd, actualStart, actualEnd });
  check(result.status === 'CLOSED', '34 min late start / 7 min late end on an 8h shift is not EXTENDED');
  check(result.startDiffMinutes === 34, `startDiffMinutes is 34 (got ${result.startDiffMinutes})`);
  check(result.endDiffMinutes === 7, `endDiffMinutes is 7 (got ${result.endDiffMinutes})`);
}

// --- The spec's own example: scheduled 18h, actual 39h30m -> EXTENDED, not an error ---
{
  // Mon 12:00 -> Tue 06:00 scheduled (18h); actual Mon 11:50 -> Wed 03:20 (39h30m)
  const scheduledStart = new Date('2026-01-05T12:00:00Z');
  const scheduledEnd = new Date('2026-01-06T06:00:00Z');
  const actualStart = new Date('2026-01-05T11:50:00Z');
  const actualEnd = new Date('2026-01-07T03:20:00Z');
  const result = compareShift({ scheduledStart, scheduledEnd, actualStart, actualEnd });

  check(result.scheduledDurationMs === 18 * H, `scheduledDurationMs is 18h (got ${result.scheduledDurationMs / H}h)`);
  check(result.actualDurationMs === 39.5 * H, `actualDurationMs is 39.5h (got ${result.actualDurationMs / H}h)`);
  check(result.differenceMs === 21.5 * H, `differenceMs is +21.5h (got ${result.differenceMs / H}h)`);
  check(result.status === 'EXTENDED', 'a shift running far past its scheduled duration is EXTENDED, not flagged as an error status');
  check(result.startDiffMinutes === -10, `startDiffMinutes still reflects the 10 min early start (got ${result.startDiffMinutes})`);
}

// --- A shift can legitimately span multiple calendar days without being EXTENDED, as long as
// it doesn't overrun its (also multi-day) schedule ---
{
  const scheduledStart = new Date('2026-01-05T22:00:00Z');
  const scheduledEnd = new Date('2026-01-07T10:00:00Z'); // 36h scheduled, spans 2 days
  const actualStart = new Date('2026-01-05T22:05:00Z');
  const actualEnd = new Date('2026-01-07T10:10:00Z'); // 36h5m actual
  const result = compareShift({ scheduledStart, scheduledEnd, actualStart, actualEnd });
  check(result.status === 'CLOSED', 'a multi-day shift close to its multi-day schedule is not EXTENDED just for spanning days');
}

console.log('\n--- Summary ---');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
}

assert.strictEqual(failures, 0, `${failures} shift comparison unit check(s) failed`);
