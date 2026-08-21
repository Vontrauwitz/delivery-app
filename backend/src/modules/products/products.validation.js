const HttpError = require('../../shared/httpError');

function validateProduct(req, res, next) {
  const { name, basePrice } = req.body;

  if (!name || typeof name !== 'string') {
    return next(new HttpError(400, 'El nombre del producto es requerido'));
  }

  if (basePrice === undefined || typeof basePrice !== 'number' || basePrice < 0) {
    return next(new HttpError(400, 'basePrice debe ser un número mayor o igual a 0'));
  }

  next();
}

module.exports = { validateProduct };
