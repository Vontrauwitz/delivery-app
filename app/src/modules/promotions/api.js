import request from '../../shared/httpClient';

export function listPromotions(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/promotions${query ? `?${query}` : ''}`, { token });
}

export function getPromotion(token, id) {
  return request(`/promotions/${id}`, { token });
}

export function createPromotion(token, payload) {
  return request('/promotions', { method: 'POST', body: payload, token });
}

export function updatePromotion(token, id, payload) {
  return request(`/promotions/${id}`, { method: 'PUT', body: payload, token });
}

export function activatePromotion(token, id) {
  return request(`/promotions/${id}/activate`, { method: 'PATCH', token });
}

export function deactivatePromotion(token, id) {
  return request(`/promotions/${id}/deactivate`, { method: 'PATCH', token });
}
