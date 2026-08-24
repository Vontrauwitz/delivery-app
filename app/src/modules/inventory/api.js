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

// The single read both the driver's own inventory screen and the manager's per-driver
// inventory screen use — same backend call, so the two can never show different numbers.
export function getMyCurrentStock(token) {
  return request('/inventory-sessions/current/mine', { token });
}

export function getCurrentStock(token, driverId) {
  return request(`/inventory-sessions/current?driver=${driverId}`, { token });
}

// "Reponer" — adds stock to whatever the driver currently has. This is the everyday way stock
// enters a driver's inventory now; there is no manual "open a session" step in the UI anymore.
export function replenish(token, { driver, items }) {
  return request('/inventory-sessions/replenish', { method: 'POST', body: { driver, items }, token });
}
