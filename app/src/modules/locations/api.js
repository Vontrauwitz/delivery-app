import request from '../../shared/httpClient';

export function recordLocation(token, { latitude, longitude, accuracy }) {
  return request('/locations', { method: 'POST', body: { latitude, longitude, accuracy }, token });
}

export function getMyLocation(token) {
  return request('/locations/mine', { token });
}

export function getCurrentLocations(token) {
  return request('/locations/current', { token });
}
