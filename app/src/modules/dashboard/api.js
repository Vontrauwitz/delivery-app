import request from '../../shared/httpClient';
import * as driverScheduleApi from '../driverSchedule/api';

// Real sales aggregation (daily series, payment split, top products) — see
// backend/src/modules/sales/sales.service.js:getSalesStats. The one new endpoint added for this
// dashboard; everything else here reuses existing routes.
export function getSalesStats(token, days = 7) {
  return request(`/sales/stats?days=${days}`, { token });
}

// Currently-open work shifts — "who's working right now" (existing generic list+filter route).
export function getOpenShifts(token) {
  return request('/work-shifts?status=OPEN', { token });
}

// Every scheduled shift matched against its actual WorkShift (or lack of one), across all
// drivers — existing route, already computes the EXTENDED/NOT_STARTED business rules
// (backend/src/shared/shiftComparison.js). The dashboard derives "didn't start" and "unusually
// long" alerts from this instead of inventing new thresholds.
export function getScheduleComparisons(token) {
  return request('/scheduled-shifts/comparisons', { token });
}

// Live per-driver expected-vs-actual status for today, from the driver-schedule module — powers
// the dashboard's "still working past expected end" alert. See
// backend/src/shared/scheduleResolution.js:deriveOperationalStatus.
export function getDriverScheduleStatuses(token) {
  return driverScheduleApi.getStatus(token);
}
