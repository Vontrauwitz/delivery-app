import request from '../../shared/httpClient';

export function listProducts(token) {
  return request('/products', { token });
}
