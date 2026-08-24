import request from '../../shared/httpClient';

export function createScheduledShift(token, payload) {
  return request('/scheduled-shifts', { method: 'POST', body: payload, token });
}

export function updateScheduledShift(token, id, payload) {
  return request(`/scheduled-shifts/${id}`, { method: 'PUT', body: payload, token });
}

export function deleteScheduledShift(token, id) {
  return request(`/scheduled-shifts/${id}`, { method: 'DELETE', token });
}

export function listScheduledShifts(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/scheduled-shifts${query ? `?${query}` : ''}`, { token });
}

export function listComparisons(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/scheduled-shifts/comparisons${query ? `?${query}` : ''}`, { token });
}
