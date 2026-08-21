const HttpError = require('../../shared/httpError');

function validateCounts(req, res, next) {
  const { counts } = req.body;

  if (!Array.isArray(counts) || counts.length === 0) {
    return next(new HttpError(400, 'Debes indicar el conteo de al menos un producto'));
  }

  next();
}

module.exports = { validateCounts };
