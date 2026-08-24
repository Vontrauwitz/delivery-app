const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./closing.service');

async function create(req, res, next) {
  try {
    const closing = await service.createClosing({
      driverId: req.user.id,
      counts: req.body.counts,
      reportedCash: req.body.reportedCash,
    });
    res.status(201).json(closing);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const filter = {};
    if (req.query.driver) filter.driver = req.query.driver;
    if (req.query.status) filter.status = req.query.status;
    const closings = await service.listClosings(filter);
    res.json(closings);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const closing = await service.getClosingById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(closing.driver?._id || closing.driver) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver este cierre'));
    }

    res.json(closing);
  } catch (err) {
    next(err);
  }
}

async function finalize(req, res, next) {
  try {
    const closing = await service.finalizeClosing(req.params.id, req.user.id, req.body.note);
    res.json(closing);
  } catch (err) {
    next(err);
  }
}

async function reopen(req, res, next) {
  try {
    const closing = await service.reopenClosing(req.params.id, req.user.id, req.body.reason);
    res.json(closing);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, finalize, reopen };
