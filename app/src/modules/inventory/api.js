import request from '../../shared/httpClient';

export function openSession(token, payload) {
  return request('/inventory-sessions', { method: 'POST', body: payload, token });
}

export function listSessions(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/inventory-sessions${query ? `?${query}` : ''}`, { token });
}

export function getMyActiveSession(token) {
  return request('/inventory-sessions/active/mine', { token });
}

export function getSession(token, id) {
  return request(`/inventory-sessions/${id}`, { token });
}

export function getExpectedInventory(token, id) {
  return request(`/inventory-sessions/${id}/expected`, { token });
}

export function updateInitialStock(token, id, initialStock) {
  return request(`/inventory-sessions/${id}/initial-stock`, {
    method: 'PATCH',
    body: { initialStock },
    token,
  });
}
