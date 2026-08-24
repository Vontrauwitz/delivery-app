import request from '../../shared/httpClient';

export function createPartialCount(token, counts) {
  return request('/inventory-counts/partial', { method: 'POST', body: { counts }, token });
}

export function listCountsBySession(token, sessionId) {
  return request(`/inventory-counts?session=${sessionId}`, { token });
}

export function getCount(token, id) {
  return request(`/inventory-counts/${id}`, { token });
}

export function createWeeklyCount(token, { driver, counts, weekOf }) {
  return request('/inventory-counts/weekly', { method: 'POST', body: { driver, counts, weekOf }, token });
}

export function listWeeklyCounts(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/inventory-counts/weekly${query ? `?${query}` : ''}`, { token });
}
