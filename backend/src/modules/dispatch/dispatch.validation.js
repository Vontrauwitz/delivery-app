const HttpError = require('../../shared/httpError');

function validateCreateDispatch(req, res, next) {
  const { driver, destinationLabel, address } = req.body;

  if (!driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }
  // destinationLabel (customer/reference) is optional — only address is actually required to
  // send a driver somewhere. If present, it still can't be a blank/whitespace-only string.
  if (destinationLabel !== undefined && destinationLabel !== null && !destinationLabel.trim()) {
    return next(new HttpError(400, 'La referencia no puede ser un texto vacío'));
  }
  if (!address || !address.trim()) {
    return next(new HttpError(400, 'La dirección es requerida'));
  }

  next();
}

module.exports = { validateCreateDispatch };
