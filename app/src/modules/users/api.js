import request from '../../shared/httpClient';

export function listUsers(token) {
  return request('/users', { token });
}

export function getDriver(token, id) {
  return request(`/users/${id}`, { token });
}

export function createDriver(token, payload) {
  return request('/users', { method: 'POST', body: payload, token });
}

export function updateDriver(token, id, payload) {
  return request(`/users/${id}`, { method: 'PUT', body: payload, token });
}

export function deleteDriver(token, id) {
  return request(`/users/${id}`, { method: 'DELETE', token });
}
