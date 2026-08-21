import request from '../../shared/httpClient';

export function login(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}

export function getMe(token) {
  return request('/users/me', { token });
}
