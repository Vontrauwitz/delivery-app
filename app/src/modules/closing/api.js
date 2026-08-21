import request from '../../shared/httpClient';

export function createClosing(token, counts, reportedCash) {
  return request('/closings', { method: 'POST', body: { counts, reportedCash }, token });
}

export function listClosings(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/closings${query ? `?${query}` : ''}`, { token });
}

export function getClosing(token, id) {
  return request(`/closings/${id}`, { token });
}

export function finalizeClosing(token, id, note) {
  return request(`/closings/${id}/finalize`, { method: 'PATCH', body: { note }, token });
}

export function reopenClosing(token, id, reason) {
  return request(`/closings/${id}/reopen`, { method: 'PATCH', body: { reason }, token });
}
