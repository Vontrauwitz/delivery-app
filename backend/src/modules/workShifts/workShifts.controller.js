const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./workShifts.service');

async function start(req, res, next) {
  try {
    const shift = await service.startShift(req.user.id);
    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
}

async function end(req, res, next) {
  try {
    const shift = await service.endShift(req.user.id);
    res.json(shift);
  } catch (err) {
    next(err);
  }
}

async function getMyActive(req, res, next) {
  try {
    const shift = await service.getActiveShiftForDriver(req.user.id);
    res.json(shift);
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const shifts = await service.listShiftsByDriver(req.user.id);
    res.json(shifts);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const filter = {};
    if (req.query.driver) filter.driver = req.query.driver;
    if (req.query.status) filter.status = req.query.status;
    const shifts = await service.listShifts(filter);
    res.json(shifts);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const shift = await service.getShiftById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(shift.driver?._id || shift.driver) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver este turno'));
    }

    res.json(shift);
  } catch (err) {
    next(err);
  }
}

async function adminEdit(req, res, next) {
  try {
    const shift = await service.adminUpdateShift(req.params.id, req.body, req.user.id);
    res.json(shift);
  } catch (err) {
    next(err);
  }
}

async function adminClose(req, res, next) {
  try {
    const shift = await service.adminCloseShift(req.params.id, req.body, req.user.id);
    res.json(shift);
  } catch (err) {
    next(err);
  }
}

module.exports = { start, end, getMyActive, listMine, list, getById, adminEdit, adminClose };
