const HttpError = require('../../shared/httpError');

function validateReason(req, res, next) {
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return next(new HttpError(400, 'El motivo es obligatorio'));
  }

  next();
}

module.exports = { validateReason };
