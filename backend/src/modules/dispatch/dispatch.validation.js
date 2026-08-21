const HttpError = require('../../shared/httpError');

function validateCreateDispatch(req, res, next) {
  const { driver, destinationLabel, address } = req.body;

  if (!driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }
  if (!destinationLabel || !destinationLabel.trim()) {
    return next(new HttpError(400, 'La etiqueta del destino es requerida'));
  }
  if (!address || !address.trim()) {
    return next(new HttpError(400, 'La dirección es requerida'));
  }

  next();
}

module.exports = { validateCreateDispatch };
