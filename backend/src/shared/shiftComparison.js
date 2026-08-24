// Deterministic scheduled-vs-actual shift comparison. Pure function, no I/O — returns raw
// numbers and a status enum; label copy (the Spanish "A tiempo" / "10 min temprano" strings)
// is generated on the frontend from these numbers, same split as everywhere else in this app
// (backend computes, frontend renders labels — e.g. SALE_STATUS_LABELS).
//
// A shift is only ever "EXTENDED" based on how much its actual duration overran the scheduled
// duration — never just because it's long or spans multiple days. Staff shortages, overnight
// coverage, and multi-day shifts are all legitimate; this never gets labeled as an error.
const EXTENDED_DURATION_MULTIPLIER = 1.5;
const EXTENDED_MIN_ABSOLUTE_MS = 2 * 60 * 60 * 1000; // 2h — avoids flagging small shifts trivially

function compareShift({ scheduledStart, scheduledEnd, actualStart, actualEnd }) {
  if (!actualStart) {
    return {
      matched: false,
      status: 'NOT_STARTED',
      startDiffMinutes: null,
      endDiffMinutes: null,
      scheduledDurationMs: new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime(),
      actualDurationMs: null,
      differenceMs: null,
    };
  }

  const scheduledStartMs = new Date(scheduledStart).getTime();
  const scheduledEndMs = new Date(scheduledEnd).getTime();
  const actualStartMs = new Date(actualStart).getTime();
  const scheduledDurationMs = scheduledEndMs - scheduledStartMs;
  const startDiffMinutes = Math.round((actualStartMs - scheduledStartMs) / 60000);

  if (!actualEnd) {
    return {
      matched: true,
      status: 'OPEN',
      startDiffMinutes,
      endDiffMinutes: null,
      scheduledDurationMs,
      actualDurationMs: Date.now() - actualStartMs,
      differenceMs: null,
    };
  }

  const actualEndMs = new Date(actualEnd).getTime();
  const actualDurationMs = actualEndMs - actualStartMs;
  const endDiffMinutes = Math.round((actualEndMs - scheduledEndMs) / 60000);
  const differenceMs = actualDurationMs - scheduledDurationMs;

  const isExtended =
    scheduledDurationMs > 0 &&
    actualDurationMs > scheduledDurationMs * EXTENDED_DURATION_MULTIPLIER &&
    differenceMs > EXTENDED_MIN_ABSOLUTE_MS;

  return {
    matched: true,
    status: isExtended ? 'EXTENDED' : 'CLOSED',
    startDiffMinutes,
    endDiffMinutes,
    scheduledDurationMs,
    actualDurationMs,
    differenceMs,
  };
}

module.exports = { compareShift };
