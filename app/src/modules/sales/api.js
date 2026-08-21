import request from '../../shared/httpClient';

export function createSale(token, payload) {
  return request('/sales', { method: 'POST', body: payload, token });
}

export function listMySales(token) {
  return request('/sales/mine', { token });
}

export function getSale(token, id) {
  return request(`/sales/${id}`, { token });
}
