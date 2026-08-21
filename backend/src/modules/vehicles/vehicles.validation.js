const HttpError = require('../../shared/httpError');

function validateCreateVehicle(req, res, next) {
  const { name } = req.body;

  if (!name || typeof name !== 'string') {
    return next(new HttpError(400, 'El nombre del vehículo es requerido'));
  }

  next();
}

module.exports = { validateCreateVehicle };
