const ScheduledShift = require('./scheduledShift.model');
const User = require('../users/user.model');
const HttpError = require('../../shared/httpError');
const { compareShift } = require('../../shared/shiftComparison');
const { ROLES, SCHEDULE_MATCH_TOLERANCE_MS } = require('../../shared/constants');

async function assertValidDriver(driverId) {
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== ROLES.DRIVER) {
    throw new HttpError(400, 'Chofer no válido');
  }
}

function assertValidRange(scheduledStart, scheduledEnd) {
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new HttpError(400, 'Fechas inválidas');
  }
  if (end <= start) {
    throw new HttpError(400, 'La hora de fin programada debe ser posterior a la de inicio');
  }
}

async function createScheduledShift({ driver, scheduledStart, scheduledEnd }, managerId) {
  await assertValidDriver(driver);
  assertValidRange(scheduledStart, scheduledEnd);

  return ScheduledShift.create({
    driver,
    scheduledStart: new Date(scheduledStart),
    scheduledEnd: new Date(scheduledEnd),
    createdBy: managerId,
  });
}

async function updateScheduledShift(id, { scheduledStart, scheduledEnd }) {
  const scheduled = await ScheduledShift.findById(id);
  if (!scheduled) {
    throw new HttpError(404, 'Turno programado no encontrado');
  }

  const newStart = scheduledStart !== undefined ? new Date(scheduledStart) : scheduled.scheduledStart;
  const newEnd = scheduledEnd !== undefined ? new Date(scheduledEnd) : scheduled.scheduledEnd;
  assertValidRange(newStart, newEnd);

  scheduled.scheduledStart = newStart;
  scheduled.scheduledEnd = newEnd;
  await scheduled.save();
  return scheduled;
}

async function deleteScheduledShift(id) {
  const scheduled = await ScheduledShift.findByIdAndDelete(id);
  if (!scheduled) {
    throw new HttpError(404, 'Turno programado no encontrado');
  }
  return scheduled;
}

async function listScheduledShifts(filter = {}) {
  const query = {};
  if (filter.driver) query.driver = filter.driver;
  return ScheduledShift.find(query)
    .sort({ scheduledStart: -1 })
    .populate('driver', 'name email')
    .populate('workShift');
}

// The one ScheduledShift that explicitly covers this exact calendar date, if any — the top of
// the shared/scheduleResolution.js priority chain. Read-only; does not touch matching.
async function findForDriverAndDate(driverId, date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return ScheduledShift.findOne({
    driver: driverId,
    scheduledStart: { $gte: dayStart, $lt: dayEnd },
  }).sort({ scheduledStart: 1 });
}

// Called once, right when a WorkShift starts. Finds the closest unmatched ScheduledShift for
// this driver within SCHEDULE_MATCH_TOLERANCE_MS and persists the match. Never called again for
// this WorkShift or this ScheduledShift after that — no re-matching, no splitting, no effect on
// the WorkShift's own timestamps.
async function matchWorkShiftToSchedule(driverId, workShift) {
  const candidates = await ScheduledShift.find({ driver: driverId, workShift: null });

  let best = null;
  let bestDiffMs = Infinity;
  for (const candidate of candidates) {
    const diffMs = Math.abs(new Date(candidate.scheduledStart).getTime() - new Date(workShift.startedAt).getTime());
    if (diffMs <= SCHEDULE_MATCH_TOLERANCE_MS && diffMs < bestDiffMs) {
      best = candidate;
      bestDiffMs = diffMs;
    }
  }

  if (!best) {
    return null;
  }

  best.workShift = workShift._id;
  await best.save();
  return best;
}

// Manager comparison view: every ScheduledShift (optionally filtered), each paired with its
// matched WorkShift (if any) and the deterministic comparison numbers.
async function listComparisons(filter = {}) {
  const scheduledShifts = await listScheduledShifts(filter);

  return scheduledShifts.map((scheduled) => {
    const workShift = scheduled.workShift;
    const comparison = compareShift({
      scheduledStart: scheduled.scheduledStart,
      scheduledEnd: scheduled.scheduledEnd,
      actualStart: workShift ? workShift.startedAt : null,
      actualEnd: workShift ? workShift.endedAt : null,
    });

    return {
      scheduledShift: {
        _id: scheduled._id,
        driver: scheduled.driver,
        scheduledStart: scheduled.scheduledStart,
        scheduledEnd: scheduled.scheduledEnd,
      },
      workShift: workShift ? { _id: workShift._id, startedAt: workShift.startedAt, endedAt: workShift.endedAt, status: workShift.status } : null,
      comparison,
    };
  });
}

module.exports = {
  createScheduledShift,
  updateScheduledShift,
  deleteScheduledShift,
  listScheduledShifts,
  findForDriverAndDate,
  matchWorkShiftToSchedule,
  listComparisons,
};
