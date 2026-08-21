const HttpError = require('../../shared/httpError');

function validateRecordLocation(req, res, next) {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return next(new HttpError(400, 'latitude y longitude son requeridos'));
  }

  next();
}

module.exports = { validateRecordLocation };
