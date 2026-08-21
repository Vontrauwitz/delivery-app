const HttpError = require('../../shared/httpError');

function validateCreateSale(req, res, next) {
  const { items, payments } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new HttpError(400, 'La venta debe incluir al menos un producto'));
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    return next(new HttpError(400, 'La venta debe incluir al menos un método de pago'));
  }

  next();
}

module.exports = { validateCreateSale };
