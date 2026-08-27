const ROLES = {
  DRIVER: 'driver',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

const PAYMENT_METHODS = ['cash', 'transfer'];

// Phase 1 supports a single promotion type: buy `quantity` units of the same product for a
// flat `bundlePrice`. More types (e.g. percentage-off, time-limited) can be added later without
// touching the Sale schema, since pricing always resolves through calculateLineSubtotal.
const PROMOTION_TYPES = {
  QUANTITY_FOR_PRICE: 'QUANTITY_FOR_PRICE',
};

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

// How far a ScheduledShift's scheduledStart may be from a WorkShift's actual startedAt for the
// two to be considered a match. Wide on purpose — real shifts can legitimately start early/late
// and span multiple days (staff shortages, extended coverage), so this is generous, not strict.
const SCHEDULE_MATCH_TOLERANCE_MS = 36 * 60 * 60 * 1000;

const ACCOUNTING_PERIOD_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

// Used when a product has no per-product override in ReplenishmentConfig.
const REPLENISHMENT_DEFAULTS = {
  COVERAGE_DAYS: 3,
  SAFETY_STOCK: 0,
};

// Consumption is averaged over at most this many recent CLOSED sessions for the vehicle
// ("prefer completed historical sessions" — an in-progress OPEN session is a partial day
// and would skew a daily average).
const REPLENISHMENT_CONSUMPTION_WINDOW_SESSIONS = 7;

// Fewer than this many CLOSED sessions in the window => insufficientHistory is flagged in
// the response, so the UI can warn the manager the suggestion is based on thin data.
const REPLENISHMENT_MIN_HISTORY_SESSIONS = 3;

// A location ping older than this is considered stale. Never stored as a boolean on the
// ping itself — always computed at read time against "now", same reasoning as PLAN.md's
// isStale note: a stored flag would go stale itself the moment nobody recomputes it.
const LOCATION_STALE_THRESHOLD_MS = 5 * 60 * 1000;

// PENDING: created by manager, waiting on the driver.
// ACCEPTED: driver has acknowledged it.
// COMPLETED / CANCELLED: terminal, permanent.
const DISPATCH_STATUSES = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

// WORK: adds a working day using the driver's normal default-shift hours (no custom times).
// REST: marks a normally-working day as off.
// CUSTOM: working day with an explicit startTime and/or durationMinutes override, distinct from
// WORK so "normal day added" and "different hours on this date" never overlap in the data.
const SCHEDULE_EXCEPTION_TYPES = {
  WORK: 'WORK',
  REST: 'REST',
  CUSTOM: 'CUSTOM',
};

// A ping/request older than this is no longer "recent" for the alert-condition layer. Same
// reasoning as LOCATION_STALE_THRESHOLD_MS just below: never stored as a boolean, always
// computed at read time against "now".
const APP_CONTACT_STALE_THRESHOLD_MS = 20 * 60 * 1000;

module.exports = {
  ROLES,
  PAYMENT_METHODS,
  PROMOTION_TYPES,
  SALE_STATUSES,
  INVENTORY_AFFECTING_SALE_STATUSES,
  SESSION_STATUSES,
  ACTIVE_SESSION_STATUSES,
  INVENTORY_COUNT_TYPES,
  CLOSING_STATUSES,
  WORK_SHIFT_STATUSES,
  REPLENISHMENT_DEFAULTS,
  REPLENISHMENT_CONSUMPTION_WINDOW_SESSIONS,
  REPLENISHMENT_MIN_HISTORY_SESSIONS,
  LOCATION_STALE_THRESHOLD_MS,
  DISPATCH_STATUSES,
  SCHEDULE_MATCH_TOLERANCE_MS,
  ACCOUNTING_PERIOD_STATUSES,
  SCHEDULE_EXCEPTION_TYPES,
  APP_CONTACT_STALE_THRESHOLD_MS,
};
