const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../shared/httpError');
const User = require('../modules/users/user.model');

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'No autenticado'));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload; // { id, role }
    // Minimal "recent app contact" signal — fire-and-forget so it never slows or fails the
    // actual request. This is the only place lastSeenAt is written; any authenticated request
    // from any screen advances it. NOT a real heartbeat: nothing fires while the app sits idle,
    // so this cannot prove a driver is still reachable partway through a quiet shift — see the
    // longer note on User.lastSeenAt. A dedicated fixed-interval active-shift heartbeat is future
    // Alerts-phase work, deliberately not built here.
    User.updateOne({ _id: payload.id }, { lastSeenAt: new Date() }).catch(() => {});
    next();
  } catch (err) {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}

module.exports = auth;
