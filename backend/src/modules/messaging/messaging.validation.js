const HttpError = require('../../shared/httpError');

function validateSendMessage(req, res, next) {
  const { recipients, body } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return next(new HttpError(400, 'Debes indicar al menos un destinatario'));
  }
  if (!body || !body.trim()) {
    return next(new HttpError(400, 'El mensaje no puede estar vacío'));
  }

  next();
}

module.exports = { validateSendMessage };
