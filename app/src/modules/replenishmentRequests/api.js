import request from '../../shared/httpClient';

export function createRequest(token, payload) {
  return request('/replenishment-requests', { method: 'POST', body: payload, token });
}

export function listRequests(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/replenishment-requests${query ? `?${query}` : ''}`, { token });
}

export function getRequest(token, id) {
  return request(`/replenishment-requests/${id}`, { token });
}

export function updateDraft(token, id, payload) {
  return request(`/replenishment-requests/${id}`, { method: 'PATCH', body: payload, token });
}

export function sendRequest(token, id) {
  return request(`/replenishment-requests/${id}/send`, { method: 'POST', token });
}

export function fulfillRequest(token, id) {
  return request(`/replenishment-requests/${id}/fulfill`, { method: 'POST', token });
}

export function cancelRequest(token, id) {
  return request(`/replenishment-requests/${id}/cancel`, { method: 'POST', token });
}
