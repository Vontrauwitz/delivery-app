const HttpError = require('../../shared/httpError');

function validateConfigBody(req, res, next) {
  const { coverageDays, safetyStock } = req.body;

  if (coverageDays === undefined || safetyStock === undefined) {
    return next(new HttpError(400, 'coverageDays y safetyStock son requeridos'));
  }

  next();
}

module.exports = { validateConfigBody };
