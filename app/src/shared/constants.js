export const ROLES = {
  DRIVER: 'driver',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const SALE_STATUS_LABELS = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  CANCELLED: 'Cancelada',
  INCIDENT: 'Incidente',
};

export const SALE_STATUS_COLORS = {
  PENDING: '#d97706',
  APPROVED: '#16a34a',
  CANCELLED: '#6b7280',
  INCIDENT: '#dc2626',
};

export const SESSION_STATUS_LABELS = {
  OPEN: 'Abierta',
  CLOSING_PENDING: 'Cierre pendiente',
  CLOSED: 'Cerrada',
};

export const CLOSING_STATUS_LABELS = {
  OPEN: 'Pendiente de revisión',
  CLOSED: 'Finalizado',
  REOPENED: 'Reabierto',
};

export const COUNT_TYPE_LABELS = {
  INITIAL: 'Inicial',
  PARTIAL: 'Parcial',
  CLOSING: 'Cierre',
  WEEKLY: 'Semanal',
};

export const SHIFT_STATUS_LABELS = {
  OPEN: 'Activo',
  CLOSED: 'Finalizado',
};

export const DISPATCH_STATUS_LABELS = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const DISPATCH_STATUS_COLORS = {
  PENDING: '#d97706',
  ACCEPTED: '#2563eb',
  COMPLETED: '#16a34a',
  CANCELLED: '#6b7280',
};

export const REPLENISHMENT_REQUEST_STATUS_LABELS = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  FULFILLED: 'Cumplido',
  CANCELLED: 'Cancelado',
};

export const REPLENISHMENT_REQUEST_STATUS_COLORS = {
  DRAFT: '#6b7280',
  SENT: '#d97706',
  FULFILLED: '#16a34a',
  CANCELLED: '#6b7280',
};

export const ALERT_SEVERITY_LABELS = {
  INFO: 'Info',
  WARNING: 'Advertencia',
  CRITICAL: 'Crítica',
};

// Matches neoTheme's own primary/warning/danger hexes — Alertas lives entirely on neo-themed
// screens, unlike the older status colors above (which predate that palette).
export const ALERT_SEVERITY_COLORS = {
  INFO: '#123B4A',
  WARNING: '#C98A1E',
  CRITICAL: '#D14B34',
};

export const ALERT_STATUS_LABELS = {
  OPEN: 'Abierta',
  ACKNOWLEDGED: 'Reconocida',
  RESOLVED: 'Resuelta',
};

export const ALERT_RULE_LABELS = {
  DRIVER_LATE_START: 'Chofer no inició turno a tiempo',
  DRIVER_SHIFT_OVERRUN: 'Turno abierto más allá de lo esperado',
  LOCATION_STALE: 'Ubicación desactualizada durante el turno',
  LOW_INVENTORY: 'Inventario en o bajo el stock de seguridad',
  PENDING_APPROVAL_TOO_LONG: 'Venta pendiente de aprobar hace demasiado tiempo',
};
