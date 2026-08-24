import { formatDurationMs } from './duration';

// Turns the backend's pure numeric comparison (status enum + raw ms/minute diffs) into the
// exact Spanish phrases from the spec. Kept separate from the backend so the pure math stays
// language-agnostic — this file is presentation only.

const TOLERANCE_MINUTES = 5;

function formatMinutesDiff(minutes) {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs} min`;
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function formatSignedDuration(ms) {
  const sign = ms < 0 ? '-' : '+';
  return `${sign}${formatDurationMs(Math.abs(ms))}`;
}

export function getStartLabel(startDiffMinutes) {
  if (startDiffMinutes === null || startDiffMinutes === undefined) return '';
  if (Math.abs(startDiffMinutes) <= TOLERANCE_MINUTES) return 'A tiempo';
  return startDiffMinutes < 0 ? `${formatMinutesDiff(startDiffMinutes)} temprano` : `${formatMinutesDiff(startDiffMinutes)} tarde`;
}

export function getEndLabel(endDiffMinutes) {
  if (endDiffMinutes === null || endDiffMinutes === undefined) return '';
  if (Math.abs(endDiffMinutes) <= TOLERANCE_MINUTES) return 'A tiempo';
  return endDiffMinutes < 0 ? `Salió ${formatMinutesDiff(endDiffMinutes)} antes` : `Salió ${formatMinutesDiff(endDiffMinutes)} tarde`;
}

// One headline word/phrase for the card — never implies a problem, matches the spec's neutral
// vocabulary exactly ("Turno extendido" instead of any punctuality label once it's run far past
// its scheduled duration).
export function getHeadlineLabel(comparison) {
  switch (comparison.status) {
    case 'NOT_STARTED':
      return 'No inició turno';
    case 'OPEN':
      return 'Turno aún abierto';
    case 'EXTENDED':
      return 'Turno extendido';
    case 'CLOSED':
      return getStartLabel(comparison.startDiffMinutes);
    default:
      return '';
  }
}

export function getStatusColor(status) {
  switch (status) {
    case 'NOT_STARTED':
      return '#9ca3af';
    case 'OPEN':
      return '#2563eb';
    case 'EXTENDED':
      return '#d97706';
    case 'CLOSED':
      return '#16a34a';
    default:
      return '#9ca3af';
  }
}

// Neutral, always-shown text for a currently-OPEN WorkShift's elapsed time — never phrased as a
// warning, regardless of how long it's been open (staff shortages, overnight coverage, etc. are
// all legitimate).
export function getOpenSinceLabel(durationMs) {
  return `Abierto desde hace ${formatDurationMs(durationMs)}`;
}
