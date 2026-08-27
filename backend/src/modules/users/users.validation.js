const HttpError = require('../../shared/httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCreateDriver(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new HttpError(400, 'El nombre es requerido'));
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    return next(new HttpError(400, 'Un email válido es requerido'));
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return next(new HttpError(400, 'La contraseña debe tener al menos 6 caracteres'));
  }

  next();
}

// Every field is optional here (a manager may only be flipping `active`, or only changing the
// name) — only reject a field that was actually sent with a bad value. An empty-string password
// is deliberately NOT an error: it's how the edit form represents "leave the password unchanged"
// (see users.service.updateDriver), never an accidental overwrite with a blank credential.
function validateUpdateDriver(req, res, next) {
  const { name, email, password, active } = req.body;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return next(new HttpError(400, 'El nombre no puede estar vacío'));
  }
  if (email !== undefined && (typeof email !== 'string' || !EMAIL_RE.test(email.trim()))) {
    return next(new HttpError(400, 'Un email válido es requerido'));
  }
  if (password !== undefined && password !== '' && (typeof password !== 'string' || password.length < 6)) {
    return next(new HttpError(400, 'La contraseña debe tener al menos 6 caracteres'));
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return next(new HttpError(400, 'active debe ser verdadero o falso'));
  }

  next();
}

module.exports = { validateCreateDriver, validateUpdateDriver };
