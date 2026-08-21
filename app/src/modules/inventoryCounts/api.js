import request from '../../shared/httpClient';

export function createPartialCount(token, counts) {
  return request('/inventory-counts/partial', { method: 'POST', body: { counts }, token });
}

export function listCountsBySession(token, sessionId) {
  return request(`/inventory-counts?session=${sessionId}`, { token });
}

export function getCount(token, id) {
  return request(`/inventory-counts/${id}`, { token });
}
