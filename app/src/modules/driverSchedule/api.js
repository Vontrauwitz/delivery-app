import request from '../../shared/httpClient';

// Manager-only: edit a driver's recurring default schedule (embedded on the User record).
export function updateDefaultShift(token, driverId, payload) {
  return request(`/driver-schedule/drivers/${driverId}/default-shift`, { method: 'PUT', body: payload, token });
}

// Manager-only: date-specific exceptions (one per driver per exact date).
export function listExceptions(token, params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/driver-schedule/exceptions${query ? `?${query}` : ''}`, { token });
}

export function createException(token, payload) {
  return request('/driver-schedule/exceptions', { method: 'POST', body: payload, token });
}

export function updateException(token, id, payload) {
  return request(`/driver-schedule/exceptions/${id}`, { method: 'PUT', body: payload, token });
}

export function deleteException(token, id) {
  return request(`/driver-schedule/exceptions/${id}`, { method: 'DELETE', token });
}

// Manager-only: what a given date resolves to (ScheduledShift > exception > default > rest),
// and the live status for one driver or every driver ("today" if date is omitted).
export function getResolved(token, driverId, date) {
  const query = new URLSearchParams({ driver: driverId, ...(date ? { date } : {}) }).toString();
  return request(`/driver-schedule/resolved?${query}`, { token });
}

export function getStatus(token, { driver, date } = {}) {
  const query = new URLSearchParams({ ...(driver ? { driver } : {}), ...(date ? { date } : {}) }).toString();
  return request(`/driver-schedule/status${query ? `?${query}` : ''}`, { token });
}

export function getAlerts(token, { driver, date } = {}) {
  const query = new URLSearchParams({ ...(driver ? { driver } : {}), ...(date ? { date } : {}) }).toString();
  return request(`/driver-schedule/alerts${query ? `?${query}` : ''}`, { token });
}

// Driver-only: their own live status ("today" the read-only screen actually needs).
export function getMyStatus(token) {
  return request('/driver-schedule/status/me', { token });
}
