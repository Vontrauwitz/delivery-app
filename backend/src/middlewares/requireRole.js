const HttpError = require('../shared/httpError');

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new HttpError(403, 'No tienes permiso para esta acción'));
    }
    next();
  };
}

module.exports = requireRole;
