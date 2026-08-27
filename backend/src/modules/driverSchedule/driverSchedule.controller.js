const service = require('./driverSchedule.service');
const { dateKeyToMidnight } = require('../../shared/scheduleResolution');

// The `date` query param is always a plain "YYYY-MM-DD" calendar date, never a full timestamp —
// parsing it with the bare `new Date(string)` constructor would read it as UTC midnight, which
// silently lands on the wrong LOCAL calendar day whenever the server isn't running in UTC (off
// by one whenever the local offset is negative). dateKeyToMidnight parses it as local midnight,
// matching how every other date-only field in this module is handled.
function parseDateParam(value) {
  return value ? dateKeyToMidnight(value) : new Date();
}

async function updateDefaultShift(req, res, next) {
  try {
    const defaultShift = await service.updateDefaultShift(req.params.driverId, req.body, req.user.id);
    res.json(defaultShift);
  } catch (err) {
    next(err);
  }
}

async function createException(req, res, next) {
  try {
    const exception = await service.createException(req.body, req.user.id);
    res.status(201).json(exception);
  } catch (err) {
    next(err);
  }
}

async function updateException(req, res, next) {
  try {
    const exception = await service.updateException(req.params.id, req.body, req.user.id);
    res.json(exception);
  } catch (err) {
    next(err);
  }
}

async function deleteException(req, res, next) {
  try {
    await service.deleteException(req.params.id, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listExceptions(req, res, next) {
  try {
    const exceptions = await service.listExceptions({ driver: req.query.driver, from: req.query.from, to: req.query.to });
    res.json(exceptions);
  } catch (err) {
    next(err);
  }
}

async function resolved(req, res, next) {
  try {
    const date = parseDateParam(req.query.date);
    const expected = await service.resolveForDate(req.query.driver, date);
    res.json(expected);
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const date = parseDateParam(req.query.date);
    if (req.query.driver) {
      res.json(await service.getStatusForDriver(req.query.driver, date));
    } else {
      res.json(await service.getStatusForAllDrivers(date));
    }
  } catch (err) {
    next(err);
  }
}

async function myStatus(req, res, next) {
  try {
    const date = parseDateParam(req.query.date);
    res.json(await service.getStatusForDriver(req.user.id, date));
  } catch (err) {
    next(err);
  }
}

async function alerts(req, res, next) {
  try {
    const date = parseDateParam(req.query.date);
    if (req.query.driver) {
      res.json(await service.checkAlertConditions(req.query.driver, date));
    } else {
      res.json(await service.checkAlertConditionsForAllDrivers(date));
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateDefaultShift,
  createException,
  updateException,
  deleteException,
  listExceptions,
  resolved,
  status,
  myStatus,
  alerts,
};
