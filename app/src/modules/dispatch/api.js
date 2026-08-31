import request from '../../shared/httpClient';

export function createDispatch(token, payload) {
  return request('/dispatch', { method: 'POST', body: payload, token });
}

export function createBatch(token, destinations) {
  return request('/dispatch/batch', { method: 'POST', body: { destinations }, token });
}

export function listMine(token) {
  return request('/dispatch/mine', { token });
}

export function listAll(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/dispatch${query ? `?${query}` : ''}`, { token });
}

export function getDispatch(token, id) {
  return request(`/dispatch/${id}`, { token });
}

export function acceptDispatch(token, id) {
  return request(`/dispatch/${id}/accept`, { method: 'PATCH', token });
}

export function completeDispatch(token, id) {
  return request(`/dispatch/${id}/complete`, { method: 'PATCH', token });
}

export function cancelDispatch(token, id) {
  return request(`/dispatch/${id}/cancel`, { method: 'PATCH', token });
}

export function assignDispatch(token, id, driverId) {
  return request(`/dispatch/${id}/assign`, { method: 'PATCH', body: { driver: driverId }, token });
}

export function batchAssign(token, ids, driverId) {
  return request('/dispatch/batch-assign', { method: 'POST', body: { ids, driver: driverId }, token });
}

export function updateDestination(token, id, payload) {
  return request(`/dispatch/${id}/destination`, { method: 'PATCH', body: payload, token });
}

export function getRouteSummary(token, driverId) {
  return request(`/dispatch/route-summary?driver=${driverId}`, { token });
}

export function reorderRoute(token, driverId, orderedIds) {
  return request('/dispatch/route-order', { method: 'PATCH', body: { driver: driverId, orderedIds }, token });
}
