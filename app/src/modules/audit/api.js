import request from '../../shared/httpClient';

export function getAuditHistory(token, entity, entityId) {
  return request(`/audit?entity=${entity}&entityId=${entityId}`, { token });
}
