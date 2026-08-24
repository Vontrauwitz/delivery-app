import request from '../../shared/httpClient';

export function getSuggestions(token, driverId) {
  return request(`/replenishment?driver=${driverId}`, { token });
}

export function listConfig(token) {
  return request('/replenishment/config', { token });
}

export function setConfig(token, productId, { coverageDays, safetyStock }) {
  return request(`/replenishment/config/${productId}`, {
    method: 'PUT',
    body: { coverageDays, safetyStock },
    token,
  });
}

export function resetConfig(token, productId) {
  return request(`/replenishment/config/${productId}`, { method: 'DELETE', token });
}
