import request from '../../shared/httpClient';

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
