import request from '../../shared/httpClient';

export function sendMessage(token, { recipients, subject, body, important }) {
  return request('/messaging', { method: 'POST', body: { recipients, subject, body, important }, token });
}

export function listInbox(token) {
  return request('/messaging/inbox', { token });
}

export function listAllMessages(token) {
  return request('/messaging', { token });
}

export function getMessage(token, id) {
  return request(`/messaging/${id}`, { token });
}

export function markRead(token, id) {
  return request(`/messaging/${id}/read`, { method: 'PATCH', token });
}
