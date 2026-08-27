const User = require('../users/user.model');
const DriverScheduleException = require('./driverScheduleException.model');
const LocationPing = require('../locations/location.model');
const HttpError = require('../../shared/httpError');
const auditService = require('../audit/audit.service');
const workShiftsService = require('../workShifts/workShifts.service');
const scheduledShiftsService = require('../scheduledShifts/scheduledShifts.service');
const { resolveExpectedShift, deriveOperationalStatus, toDateKey, dateKeyToMidnight } = require('../../shared/scheduleResolution');
const { ROLES, SCHEDULE_EXCEPTION_TYPES, LOCATION_STALE_THRESHOLD_MS, APP_CONTACT_STALE_THRESHOLD_MS } = require('../../shared/constants');

async function assertDriver(driverId) {
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== ROLES.DRIVER) {
    throw new HttpError(400, 'Chofer no válido');
  }
  return driver;
}

// ---------------------------------------------------------------------------------------------
// Default schedule (embedded on User.defaultShift) — manager can edit, driver can only view (the
// view is just the existing GET /users/me / GET /users, which already return the field once it
// exists on the schema; no separate read endpoint needed).
// ---------------------------------------------------------------------------------------------

async function updateDefaultShift(driverId, { name, startTime, durationMinutes, activeDays, enabled, effectiveFrom }, managerId) {
  const driver = await assertDriver(driverId);

  const before = driver.defaultShift ? driver.defaultShift.toObject() : {};
  driver.defaultShift = {
    name: name !== undefined ? name : before.name || '',
    startTime: enabled ? startTime : startTime ?? before.startTime ?? null,
    durationMinutes: enabled ? durationMinutes : durationMinutes ?? before.durationMinutes ?? null,
    activeDays: enabled ? activeDays : activeDays ?? before.activeDays ?? [],
    // "YYYY-MM-DD" -> local midnight, same conversion as everywhere else a date-only string
    // crosses this boundary (see driverSchedule.controller.js's parseDateParam) — never the
    // bare `new Date(string)` UTC-midnight parse.
    effectiveFrom: effectiveFrom ? dateKeyToMidnight(effectiveFrom) : effectiveFrom === null ? null : before.effectiveFrom ?? null,
    enabled: !!enabled,
  };
  await driver.save();

  await auditService.logChange({
    entity: 'User',
    entityId: driver._id,
    action: 'UPDATE_DEFAULT_SHIFT',
    changes: [{ field: 'defaultShift', oldValue: before, newValue: driver.defaultShift.toObject() }],
    performedBy: managerId,
  });

  return driver.defaultShift;
}

// ---------------------------------------------------------------------------------------------
// Date-specific exceptions — full manager-only CRUD, one per driver per exact date.
// ---------------------------------------------------------------------------------------------

async function createException({ driver, date, type, startTime, durationMinutes, reason }, managerId) {
  await assertDriver(driver);
  // `date` is always a plain "YYYY-MM-DD" calendar date (never a full timestamp) — parsed as
  // local midnight, not the bare `new Date(string)` UTC-midnight parse, for the same reason as
  // driverSchedule.controller.js's parseDateParam.
  const parsedDate = dateKeyToMidnight(date);
  const dateKey = toDateKey(parsedDate);

  const existing = await DriverScheduleException.findOne({ driver, dateKey });
  if (existing) {
    throw new HttpError(409, 'Ya existe una excepción para este chofer en esta fecha — edítala en vez de crear otra');
  }

  const exception = await DriverScheduleException.create({
    driver,
    dateKey,
    date: parsedDate,
    type,
    startTime: type === SCHEDULE_EXCEPTION_TYPES.CUSTOM ? startTime ?? null : null,
    durationMinutes: type === SCHEDULE_EXCEPTION_TYPES.CUSTOM ? durationMinutes ?? null : null,
    reason: reason || '',
    createdBy: managerId,
  });

  await auditService.logChange({
    entity: 'DriverScheduleException',
    entityId: exception._id,
    action: 'CREATE_SCHEDULE_EXCEPTION',
    changes: [{ field: 'exception', oldValue: null, newValue: exception.toObject() }],
    performedBy: managerId,
  });

  return exception;
}

async function updateException(id, { type, startTime, durationMinutes, reason }, managerId) {
  const exception = await DriverScheduleException.findById(id);
  if (!exception) {
    throw new HttpError(404, 'Excepción no encontrada');
  }

  const before = exception.toObject();

  if (type !== undefined) exception.type = type;
  exception.startTime = exception.type === SCHEDULE_EXCEPTION_TYPES.CUSTOM ? startTime ?? exception.startTime ?? null : null;
  exception.durationMinutes =
    exception.type === SCHEDULE_EXCEPTION_TYPES.CUSTOM ? durationMinutes ?? exception.durationMinutes ?? null : null;
  if (reason !== undefined) exception.reason = reason;

  await exception.save();

  await auditService.logChange({
    entity: 'DriverScheduleException',
    entityId: exception._id,
    action: 'UPDATE_SCHEDULE_EXCEPTION',
    changes: [{ field: 'exception', oldValue: before, newValue: exception.toObject() }],
    performedBy: managerId,
  });

  return exception;
}

async function deleteException(id, managerId) {
  const exception = await DriverScheduleException.findById(id);
  if (!exception) {
    throw new HttpError(404, 'Excepción no encontrada');
  }

  await auditService.logChange({
    entity: 'DriverScheduleException',
    entityId: exception._id,
    action: 'DELETE_SCHEDULE_EXCEPTION',
    changes: [{ field: 'exception', oldValue: exception.toObject(), newValue: null }],
    performedBy: managerId,
  });

  await exception.deleteOne();
  return exception;
}

async function listExceptions({ driver, from, to } = {}) {
  const query = {};
  if (driver) query.driver = driver;
  if (from || to) {
    query.date = {};
    // Same local-midnight parsing as everywhere else here — the stored `date` field is always
    // local midnight, so a bare `new Date(fromString)` (UTC midnight) would silently exclude/
    // include the wrong boundary date whenever the server isn't running in UTC.
    if (from) query.date.$gte = dateKeyToMidnight(from);
    if (to) query.date.$lte = dateKeyToMidnight(to);
  }
  return DriverScheduleException.find(query).sort({ date: 1 }).populate('driver', 'name email').populate('createdBy', 'name email');
}

// ---------------------------------------------------------------------------------------------
// Resolution + live status.
// ---------------------------------------------------------------------------------------------

async function resolveForDate(driverId, date) {
  const driver = await assertDriver(driverId);
  const dateKey = toDateKey(date);

  const [exception, scheduledShift] = await Promise.all([
    DriverScheduleException.findOne({ driver: driverId, dateKey }),
    scheduledShiftsService.findForDriverAndDate(driverId, date),
  ]);

  return resolveExpectedShift({
    date,
    defaultShift: driver.defaultShift,
    exception,
    scheduledShift,
  });
}

async function getStatusForDriver(driverId, date = new Date()) {
  const [expected, workShift] = await Promise.all([
    resolveForDate(driverId, date),
    workShiftsService.findShiftForDate(driverId, date),
  ]);

  const live = deriveOperationalStatus({ expected, workShift, now: new Date() });

  return {
    driver: driverId,
    date: toDateKey(date),
    expected: {
      source: expected.source,
      isWorkingDay: expected.isWorkingDay,
      expectedStart: expected.expectedStart,
      expectedEnd: expected.expectedEnd,
      reason: expected.reason,
    },
    workShift: workShift ? { _id: workShift._id, startedAt: workShift.startedAt, endedAt: workShift.endedAt, status: workShift.status } : null,
    status: live.status,
    startStatus: live.startStatus,
    startDiffMinutes: live.startDiffMinutes,
    endDiffMinutes: live.endDiffMinutes,
  };
}

async function getStatusForAllDrivers(date = new Date()) {
  const drivers = await User.find({ role: ROLES.DRIVER, active: true }).sort({ name: 1 });
  const results = await Promise.all(
    drivers.map(async (driver) => {
      const status = await getStatusForDriver(driver._id, date);
      return { ...status, driver: { _id: driver._id, name: driver.name, email: driver.email } };
    })
  );
  return results;
}

// ---------------------------------------------------------------------------------------------
// Alert-condition layer (foundation only — no SMS/email/calls yet). Each condition is derived
// fresh from current state, never stored, same reasoning as LocationPing.isStale. "No recent app
// contact" (User.lastSeenAt, updated by the auth middleware on any authenticated request) and
// "no recent location" (LocationPing, already existed for the drivers map) are kept as two
// separate conditions on purpose — a driver can be actively using the app with location denied,
// or have a stale app session while location keeps reporting in the background; conflating them
// would hide whichever signal went bad.
//
// NO_RECENT_APP_CONTACT is a weak signal, not a liveness guarantee: lastSeenAt only advances on
// whatever authenticated requests happen to fire, so an idle driver mid-shift can go quiet with
// no request ever firing and no way to distinguish "fine, just not touching the phone" from
// "unreachable" — see the fuller note on User.lastSeenAt. A real fixed-interval active-shift
// heartbeat is intentionally left to a future Alerts phase.
// ---------------------------------------------------------------------------------------------

async function checkAlertConditions(driverId, date = new Date()) {
  const status = await getStatusForDriver(driverId, date);
  const now = Date.now();

  const [driver, latestPing] = await Promise.all([
    User.findById(driverId).select('lastSeenAt'),
    LocationPing.findOne({ driver: driverId }).sort({ serverTimestamp: -1 }),
  ]);

  const conditions = [];

  if (status.status === 'NOT_STARTED' && status.expected.expectedStart && now > new Date(status.expected.expectedStart).getTime()) {
    conditions.push({
      code: 'EXPECTED_SHIFT_NOT_STARTED',
      message: 'Turno esperado no iniciado después de la hora programada',
    });
  }

  if (status.status === 'SHOULD_HAVE_ENDED') {
    conditions.push({
      code: 'ACTIVE_SHIFT_PAST_EXPECTED_END',
      message: 'Turno activo sigue abierto después de la hora esperada de fin',
    });
  }

  const inExpectedWorkingPeriod =
    status.expected.isWorkingDay &&
    status.expected.expectedStart &&
    now >= new Date(status.expected.expectedStart).getTime() &&
    (!status.expected.expectedEnd || status.status === 'SHOULD_HAVE_ENDED' || now <= new Date(status.expected.expectedEnd).getTime());

  if (inExpectedWorkingPeriod) {
    const lastSeenAgeMs = driver?.lastSeenAt ? now - new Date(driver.lastSeenAt).getTime() : null;
    if (lastSeenAgeMs === null || lastSeenAgeMs > APP_CONTACT_STALE_THRESHOLD_MS) {
      conditions.push({
        code: 'NO_RECENT_APP_CONTACT',
        message: 'Sin contacto reciente con la app durante el período de trabajo esperado',
      });
    }

    const locationAgeMs = latestPing ? now - new Date(latestPing.serverTimestamp).getTime() : null;
    if (locationAgeMs === null || locationAgeMs > LOCATION_STALE_THRESHOLD_MS) {
      conditions.push({
        code: 'NO_RECENT_LOCATION',
        message: 'Sin ubicación reciente durante el período de trabajo esperado',
      });
    }
  }

  return { driver: driverId, date: status.date, status: status.status, conditions };
}

async function checkAlertConditionsForAllDrivers(date = new Date()) {
  const drivers = await User.find({ role: ROLES.DRIVER, active: true }).select('_id');
  return Promise.all(drivers.map((d) => checkAlertConditions(d._id, date)));
}

module.exports = {
  updateDefaultShift,
  createException,
  updateException,
  deleteException,
  listExceptions,
  resolveForDate,
  getStatusForDriver,
  getStatusForAllDrivers,
  checkAlertConditions,
  checkAlertConditionsForAllDrivers,
};
