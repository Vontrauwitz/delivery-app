import request from '../../shared/httpClient';

export function listPendingSales(token) {
  return request('/approvals/pending', { token });
}

export function updateSale(token, id, payload) {
  return request(`/approvals/${id}`, { method: 'PUT', body: payload, token });
}

export function approveSale(token, id) {
  return request(`/approvals/${id}/approve`, { method: 'PATCH', token });
}

export function cancelSale(token, id, reason) {
  return request(`/approvals/${id}/cancel`, { method: 'PATCH', body: { reason }, token });
}

export function markIncident(token, id, note) {
  return request(`/approvals/${id}/mark-incident`, { method: 'PATCH', body: { note }, token });
}
