import request from '../../shared/httpClient';

export function listVehicles(token) {
  return request('/vehicles', { token });
}

export function getMyVehicle(token) {
  return request('/vehicles/mine', { token });
}
