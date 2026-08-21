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

module.exports = { ROLES, PAYMENT_METHODS, SALE_STATUSES };
