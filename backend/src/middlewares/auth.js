const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../shared/httpError');
const User = require('../modules/users/user.model');

async function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'No autenticado'));
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (err) {
    return next(new HttpError(401, 'Token inválido o expirado'));
  }

  req.user = payload; // { id, role }

  try {
    // Combines the existing lastSeenAt "recent app contact" write with the active-account check
    // a deactivated user needs to actually be locked out — login already refused an inactive
    // user a new token (see auth.service.login), but a token issued before deactivation was
    // otherwise still honored by every other route for the rest of its (default 7-day) life.
    // findByIdAndUpdate still writes lastSeenAt in the same request this check needs anyway, so
    // this replaces the old fire-and-forget update with one awaited round trip rather than
    // adding a second query.
    //
    // A user that no longer exists at all (deleted, not deactivated) is deliberately NOT
    // rejected here — that's a distinct case some routes need to tell apart from "deactivated"
    // (see users.controller.getMe's 404, which AuthContext.restoreSession() relies on to decide
    // "stale session, sign out" vs. "network hiccup, keep retrying" — collapsing it into this
    // same 401 would break that). Only an existing-but-inactive user is blocked here.
    const user = await User.findByIdAndUpdate(payload.id, { lastSeenAt: new Date() }, { new: true }).select('active');
    if (user && !user.active) {
      return next(new HttpError(401, 'Cuenta desactivada'));
    }
    next();
  } catch (err) {
    next(new HttpError(401, 'No autenticado'));
  }
}

module.exports = auth;
