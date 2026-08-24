const HttpError = require('../../shared/httpError');

function validateOpenSession(req, res, next) {
  const { driver, initialStock } = req.body;

  if (!driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }

  if (!Array.isArray(initialStock) || initialStock.length === 0) {
    return next(new HttpError(400, 'Debes indicar el stock inicial de al menos un producto'));
  }

  next();
}

function validateReplenish(req, res, next) {
  const { driver, items } = req.body;

  if (!driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }

  if (!Array.isArray(items) || items.length === 0) {
    return next(new HttpError(400, 'Debes indicar la cantidad a reponer de al menos un producto'));
  }

  next();
}

module.exports = { validateOpenSession, validateReplenish };
