const HttpError = require('../../shared/httpError');

function validateSendMessage(req, res, next) {
  const { recipients, body, important } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return next(new HttpError(400, 'Debes indicar al menos un destinatario'));
  }
  if (!body || !body.trim()) {
    return next(new HttpError(400, 'El mensaje no puede estar vacío'));
  }
  if (important !== undefined && typeof important !== 'boolean') {
    return next(new HttpError(400, 'important debe ser verdadero o falso'));
  }

  next();
}

module.exports = { validateSendMessage };
