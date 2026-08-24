const HttpError = require('../../shared/httpError');

function validateCreatePromotion(req, res, next) {
  const { product, quantity, bundlePrice } = req.body;

  if (!product) {
    return next(new HttpError(400, 'El producto es requerido'));
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 2) {
    return next(new HttpError(400, 'La cantidad debe ser un número entero mayor o igual a 2'));
  }

  const price = Number(bundlePrice);
  if (!Number.isFinite(price) || price < 0) {
    return next(new HttpError(400, 'El precio del paquete debe ser un número mayor o igual a 0'));
  }

  next();
}

function validateUpdatePromotion(req, res, next) {
  const { quantity, bundlePrice } = req.body;

  if (quantity !== undefined) {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 2) {
      return next(new HttpError(400, 'La cantidad debe ser un número entero mayor o igual a 2'));
    }
  }

  if (bundlePrice !== undefined) {
    const price = Number(bundlePrice);
    if (!Number.isFinite(price) || price < 0) {
      return next(new HttpError(400, 'El precio del paquete debe ser un número mayor o igual a 0'));
    }
  }

  next();
}

module.exports = { validateCreatePromotion, validateUpdatePromotion };
