import request from '../../shared/httpClient';

export function listRules(token) {
  return request('/alerts/rules', { token });
}

export function updateRule(token, key, payload) {
  return request(`/alerts/rules/${key}`, { method: 'PATCH', body: payload, token });
}

export function evaluate(token) {
  return request('/alerts/evaluate', { method: 'POST', token });
}

export function listAlerts(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/alerts${query ? `?${query}` : ''}`, { token });
}

export function getAlert(token, id) {
  return request(`/alerts/${id}`, { token });
}

export function acknowledgeAlert(token, id) {
  return request(`/alerts/${id}/acknowledge`, { method: 'POST', token });
}
