// "YYYY-MM-DD" in local calendar time — must match the backend's shared/scheduleResolution.js
// toDateKey exactly (local components, never UTC) so a date picked on-screen lands on the same
// calendar day the backend resolves against.
export function toDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ISO 8601 weekday: 1=Monday..7=Sunday. Matches shared/scheduleResolution.js's getIsoWeekday.
export function getIsoWeekday(date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']; // index 0 = ISO day 1 (Monday)
