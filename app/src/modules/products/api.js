import request from '../../shared/httpClient';

export function listProducts(token) {
  return request('/products', { token });
}

export function getProduct(token, id) {
  return request(`/products/${id}`, { token });
}

export function createProduct(token, payload) {
  return request('/products', { method: 'POST', body: payload, token });
}

export function updateProduct(token, id, payload) {
  return request(`/products/${id}`, { method: 'PUT', body: payload, token });
}

export function deleteProduct(token, id) {
  return request(`/products/${id}`, { method: 'DELETE', token });
}
