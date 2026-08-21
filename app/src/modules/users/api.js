import request from '../../shared/httpClient';

export function listUsers(token) {
  return request('/users', { token });
}
