const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./inventoryCounts.service');

async function createPartial(req, res, next) {
  try {
    const count = await service.createPartialCount(req.user.id, req.body.counts);
    res.status(201).json(count);
  } catch (err) {
    next(err);
  }
}

async function listBySession(req, res, next) {
  try {
    if (!req.query.session) {
      return next(new HttpError(400, 'El parámetro session es requerido'));
    }
    const counts = await service.listCountsBySession(req.query.session);

    if (req.user.role === ROLES.DRIVER) {
      const forbidden = counts.some((c) => String(c.driver?._id || c.driver) !== req.user.id);
      if (forbidden) {
        return next(new HttpError(403, 'No tienes permiso para ver estos conteos'));
      }
    }

    res.json(counts);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const count = await service.getCountById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(count.driver?._id || count.driver) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver este conteo'));
    }

    res.json(count);
  } catch (err) {
    next(err);
  }
}

async function createWeekly(req, res, next) {
  try {
    if (!req.body.driver) {
      return next(new HttpError(400, 'El chofer es requerido'));
    }
    const count = await service.createWeeklyCount({
      driverId: req.body.driver,
      rawCounts: req.body.counts,
      weekOf: req.body.weekOf,
      createdBy: req.user.id,
    });
    res.status(201).json(count);
  } catch (err) {
    next(err);
  }
}

async function listWeekly(req, res, next) {
  try {
    const filter = {};
    if (req.query.driver) filter.driver = req.query.driver;
    const counts = await service.listWeeklyCounts(filter);
    res.json(counts);
  } catch (err) {
    next(err);
  }
}

module.exports = { createPartial, listBySession, getById, createWeekly, listWeekly };
