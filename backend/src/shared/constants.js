const ROLES = {
  DRIVER: 'driver',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

const PAYMENT_METHODS = ['cash', 'transfer'];

const SALE_STATUSES = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CANCELLED: 'CANCELLED',
  INCIDENT: 'INCIDENT',
};

// Statuses that represent a real physical movement of stock out of the vehicle.
const INVENTORY_AFFECTING_SALE_STATUSES = [
  SALE_STATUSES.PENDING,
  SALE_STATUSES.APPROVED,
  SALE_STATUSES.INCIDENT,
];

// OPEN: operational (sales/counts/closing allowed).
// CLOSING_PENDING: a Closing was submitted — session is frozen until the manager
// finalizes it (or administratively reopens it back to OPEN).
// CLOSED: fully finalized, permanent.
const SESSION_STATUSES = {
  OPEN: 'OPEN',
  CLOSING_PENDING: 'CLOSING_PENDING',
  CLOSED: 'CLOSED',
};

// Statuses that keep an InventorySession available for opening a new session on
// the same vehicle. Only a fully CLOSED session frees up the vehicle.
const ACTIVE_SESSION_STATUSES = [SESSION_STATUSES.OPEN, SESSION_STATUSES.CLOSING_PENDING];

const INVENTORY_COUNT_TYPES = {
  INITIAL: 'INITIAL',
  PARTIAL: 'PARTIAL',
  CLOSING: 'CLOSING',
  WEEKLY: 'WEEKLY',
};

// OPEN: submitted by driver, pending manager review/finalize.
// CLOSED: finalized by manager, permanent.
// REOPENED: manager sent it back for correction — frozen historical record, never deleted.
const CLOSING_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
};

const WORK_SHIFT_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

module.exports = {
  ROLES,
  PAYMENT_METHODS,
  SALE_STATUSES,
  INVENTORY_AFFECTING_SALE_STATUSES,
  SESSION_STATUSES,
  ACTIVE_SESSION_STATUSES,
  INVENTORY_COUNT_TYPES,
  CLOSING_STATUSES,
  WORK_SHIFT_STATUSES,
};
