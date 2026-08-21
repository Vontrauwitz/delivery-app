import request from '../../shared/httpClient';

export function getSuggestions(token, vehicleId) {
  return request(`/replenishment?vehicle=${vehicleId}`, { token });
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
