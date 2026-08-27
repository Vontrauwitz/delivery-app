const WorkShift = require('./workShift.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { WORK_SHIFT_STATUSES } = require('../../shared/constants');
const vehiclesService = require('../vehicles/vehicles.service');
const auditService = require('../audit/audit.service');
const scheduledShiftsService = require('../scheduledShifts/scheduledShifts.service');

async function getOpenShiftForDriver(driverId) {
  return WorkShift.findOne({ driver: driverId, status: WORK_SHIFT_STATUSES.OPEN });
}

async function loadShiftOrFail(id) {
  const shift = await WorkShift.findById(id);
  if (!shift) {
    throw new HttpError(404, 'Turno no encontrado');
  }
  return shift;
}

// Duration is always derived from startedAt/endedAt — never stored as the source of truth.
function withDuration(shift) {
  const obj = shift.toObject ? shift.toObject() : shift;
  const end = obj.endedAt ? new Date(obj.endedAt) : new Date();
  const durationMs = Math.max(0, end.getTime() - new Date(obj.startedAt).getTime());
  obj.durationMs = durationMs;
  obj.durationHours = round2(durationMs / (1000 * 60 * 60));
  return obj;
}

async function getShiftById(id) {
  const shift = await WorkShift.findById(id)
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('startedBy', 'name email')
    .populate('endedBy', 'name email');

  if (!shift) {
    throw new HttpError(404, 'Turno no encontrado');
  }

  return withDuration(shift);
}

async function getActiveShiftForDriver(driverId) {
  const shift = await getOpenShiftForDriver(driverId);
  if (!shift) {
    return null;
  }
  return getShiftById(shift._id);
}

async function listShiftsByDriver(driverId, limit = 20) {
  const shifts = await WorkShift.find({ driver: driverId })
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate('vehicle', 'name');

  return shifts.map(withDuration);
}

// The one WorkShift that represents "today" for this driver, for live schedule-status purposes:
// their currently OPEN shift if they have one (regardless of which calendar date it started —
// only one can ever be open per driver, so this is unambiguous), otherwise the most recent
// CLOSED shift that started on this calendar date, otherwise null (nothing happened today).
// Read-only, no side effects — never touches matching/audit, unlike startShift/endShift.
async function findShiftForDate(driverId, date) {
  const open = await getOpenShiftForDriver(driverId);
  if (open) return open;

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return WorkShift.findOne({
    driver: driverId,
    status: WORK_SHIFT_STATUSES.CLOSED,
    startedAt: { $gte: dayStart, $lt: dayEnd },
  }).sort({ startedAt: -1 });
}

async function listShifts(filter = {}) {
  const shifts = await WorkShift.find(filter)
    .sort({ startedAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name');

  return shifts.map(withDuration);
}

async function startShift(driverId) {
  // Vehicle is resolved server-side from the driver's own assignment — never trusted from the client.
  const vehicle = await vehiclesService.getActiveVehicleForDriver(driverId);
  if (!vehicle) {
    throw new HttpError(400, 'No tienes un vehículo activo asignado. Contacta a tu manager.');
  }

  const existing = await getOpenShiftForDriver(driverId);
  if (existing) {
    throw new HttpError(400, 'Ya tienes un turno abierto.');
  }

  let shift;
  try {
    shift = await WorkShift.create({
      driver: driverId,
      vehicle: vehicle._id,
      startedAt: new Date(),
      status: WORK_SHIFT_STATUSES.OPEN,
      startedBy: driverId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(400, 'Ya tienes un turno abierto.');
    }
    throw err;
  }

  await auditService.logChange({
    entity: 'WorkShift',
    entityId: shift._id,
    action: 'START_SHIFT',
    changes: [{ field: 'status', oldValue: null, newValue: WORK_SHIFT_STATUSES.OPEN }],
    performedBy: driverId,
  });

  // One-time match against the manager's schedule, for comparison only — this never affects
  // the WorkShift's own timestamps and is never revisited later.
  await scheduledShiftsService.matchWorkShiftToSchedule(driverId, shift);

  return getShiftById(shift._id);
}

async function endShift(driverId) {
  const shift = await getOpenShiftForDriver(driverId);
  if (!shift) {
    throw new HttpError(400, 'No tienes un turno abierto.');
  }

  shift.status = WORK_SHIFT_STATUSES.CLOSED;
  shift.endedAt = new Date();
  shift.endedBy = driverId;
  await shift.save();

  await auditService.logChange({
    entity: 'WorkShift',
    entityId: shift._id,
    action: 'END_SHIFT',
    changes: [{ field: 'status', oldValue: WORK_SHIFT_STATUSES.OPEN, newValue: WORK_SHIFT_STATUSES.CLOSED }],
    performedBy: driverId,
  });

  return getShiftById(shift._id);
}

function assertValidDates(startedAt, endedAt) {
  if (Number.isNaN(new Date(startedAt).getTime())) {
    throw new HttpError(400, 'startedAt inválido');
  }
  if (endedAt !== null && endedAt !== undefined) {
    if (Number.isNaN(new Date(endedAt).getTime())) {
      throw new HttpError(400, 'endedAt inválido');
    }
    if (new Date(endedAt) < new Date(startedAt)) {
      throw new HttpError(400, 'endedAt no puede ser anterior a startedAt');
    }
  }
}

async function adminUpdateShift(id, { startedAt, endedAt, reason }, managerId) {
  if (!reason || !reason.trim()) {
    throw new HttpError(400, 'El motivo de la corrección es obligatorio');
  }

  const shift = await loadShiftOrFail(id);

  const newStartedAt = startedAt !== undefined ? new Date(startedAt) : shift.startedAt;
  const newEndedAt = endedAt !== undefined ? (endedAt === null ? null : new Date(endedAt)) : shift.endedAt;
  assertValidDates(newStartedAt, newEndedAt);

  const changes = [{ field: 'reason', oldValue: null, newValue: reason.trim() }];

  if (new Date(newStartedAt).getTime() !== new Date(shift.startedAt).getTime()) {
    changes.push({ field: 'startedAt', oldValue: shift.startedAt, newValue: newStartedAt });
    shift.startedAt = newStartedAt;
  }

  const oldEndedTime = shift.endedAt ? new Date(shift.endedAt).getTime() : null;
  const newEndedTime = newEndedAt ? new Date(newEndedAt).getTime() : null;
  if (oldEndedTime !== newEndedTime) {
    changes.push({ field: 'endedAt', oldValue: shift.endedAt, newValue: newEndedAt });
    shift.endedAt = newEndedAt;
  }

  await shift.save();

  await auditService.logChange({
    entity: 'WorkShift',
    entityId: shift._id,
    action: 'ADMIN_EDIT_SHIFT',
    changes,
    performedBy: managerId,
  });

  return getShiftById(shift._id);
}

async function adminCloseShift(id, { endedAt, reason }, managerId) {
  if (!reason || !reason.trim()) {
    throw new HttpError(400, 'El motivo es obligatorio');
  }

  const shift = await loadShiftOrFail(id);
  if (shift.status !== WORK_SHIFT_STATUSES.OPEN) {
    throw new HttpError(400, 'El turno ya está cerrado');
  }

  const newEndedAt = endedAt ? new Date(endedAt) : new Date();
  assertValidDates(shift.startedAt, newEndedAt);

  shift.status = WORK_SHIFT_STATUSES.CLOSED;
  shift.endedAt = newEndedAt;
  shift.endedBy = managerId;
  await shift.save();

  await auditService.logChange({
    entity: 'WorkShift',
    entityId: shift._id,
    action: 'ADMIN_CLOSE_SHIFT',
    changes: [
      { field: 'status', oldValue: WORK_SHIFT_STATUSES.OPEN, newValue: WORK_SHIFT_STATUSES.CLOSED },
      { field: 'endedAt', oldValue: null, newValue: newEndedAt },
      { field: 'reason', oldValue: null, newValue: reason.trim() },
    ],
    performedBy: managerId,
  });

  return getShiftById(shift._id);
}

module.exports = {
  getOpenShiftForDriver,
  getActiveShiftForDriver,
  getShiftById,
  listShiftsByDriver,
  listShifts,
  findShiftForDate,
  startShift,
  endShift,
  adminUpdateShift,
  adminCloseShift,
};
