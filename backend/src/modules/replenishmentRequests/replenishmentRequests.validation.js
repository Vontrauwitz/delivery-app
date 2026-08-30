const HttpError = require('../../shared/httpError');

// Shallow, cheap checks only — anything requiring a DB lookup (product existence/active state,
// driver/vehicle validity, duplicate detection) happens in the service, same split as
// sales.validation.js/dispatch.validation.js.
function validateCreateBody(req, res, next) {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new HttpError(400, 'La solicitud debe incluir al menos un producto'));
  }

  next();
}

module.exports = { validateCreateBody };
