const HttpError = require('../../shared/httpError');

function validateOpenSession(req, res, next) {
  const { vehicle, initialStock } = req.body;

  if (!vehicle) {
    return next(new HttpError(400, 'El vehículo es requerido'));
  }

  if (!Array.isArray(initialStock) || initialStock.length === 0) {
    return next(new HttpError(400, 'Debes indicar el stock inicial de al menos un producto'));
  }

  next();
}

module.exports = { validateOpenSession };
