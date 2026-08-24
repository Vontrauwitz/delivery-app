import request from '../../shared/httpClient';

export function getCurrentPeriod(token) {
  return request('/accounting-periods/current', { token });
}

export function listPeriods(token) {
  return request('/accounting-periods', { token });
}

export function closePeriod(token) {
  return request('/accounting-periods/close', { method: 'PATCH', token });
}
