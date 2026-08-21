import request from '../../shared/httpClient';

export function startShift(token) {
  return request('/work-shifts/start', { method: 'POST', token });
}

export function endShift(token) {
  return request('/work-shifts/end', { method: 'PATCH', token });
}

export function getMyActiveShift(token) {
  return request('/work-shifts/active/mine', { token });
}

export function listMyShifts(token) {
  return request('/work-shifts/mine', { token });
}

export function listShifts(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/work-shifts${query ? `?${query}` : ''}`, { token });
}

export function getShift(token, id) {
  return request(`/work-shifts/${id}`, { token });
}

export function adminEditShift(token, id, payload) {
  return request(`/work-shifts/${id}/admin-edit`, { method: 'PATCH', body: payload, token });
}

export function adminCloseShift(token, id, payload) {
  return request(`/work-shifts/${id}/admin-close`, { method: 'PATCH', body: payload, token });
}
