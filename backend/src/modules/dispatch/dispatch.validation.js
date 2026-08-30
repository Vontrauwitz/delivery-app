const HttpError = require('../../shared/httpError');

// driver is optional now — omitting it creates an UNASSIGNED destination in the operational pool
// (Mapa Operativo checkpoint); providing one keeps the original create-with-driver behavior
// unchanged (starts PENDING).
function validateCreateDispatch(req, res, next) {
  const { destinationLabel, address } = req.body;

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

// Shallow check only — per-line trimming/blank-filtering/error reporting happens in
// dispatch.service.createBatch, which needs to report per-line outcomes, not just accept/reject
// the whole request.
function validateBatchCreate(req, res, next) {
  if (!Array.isArray(req.body.destinations)) {
    return next(new HttpError(400, 'destinations debe ser una lista de direcciones'));
  }
  next();
}

function validateAssign(req, res, next) {
  if (!req.body.driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }
  next();
}

function validateBatchAssign(req, res, next) {
  if (!Array.isArray(req.body.ids) || req.body.ids.length === 0) {
    return next(new HttpError(400, 'Debes seleccionar al menos un dispatch'));
  }
  if (!req.body.driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }
  next();
}

function validateUpdateDestination(req, res, next) {
  const { address, destinationLabel, latitude, longitude } = req.body;

  if (address === undefined && destinationLabel === undefined && latitude === undefined && longitude === undefined) {
    return next(new HttpError(400, 'Debes indicar al menos un campo a actualizar'));
  }
  if ((latitude !== undefined) !== (longitude !== undefined)) {
    return next(new HttpError(400, 'latitude y longitude deben proporcionarse juntas'));
  }

  next();
}

module.exports = { validateCreateDispatch, validateBatchCreate, validateAssign, validateBatchAssign, validateUpdateDestination };
