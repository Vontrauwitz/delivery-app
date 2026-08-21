const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../shared/httpError');

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'No autenticado'));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload; // { id, role }
    next();
  } catch (err) {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}

module.exports = auth;
