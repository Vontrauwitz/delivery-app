import request from '../../shared/httpClient';

export function createDispatch(token, payload) {
  return request('/dispatch', { method: 'POST', body: payload, token });
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
