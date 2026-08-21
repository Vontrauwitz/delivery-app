const HttpError = require('../../shared/httpError');
const { PAYMENT_METHODS } = require('../../shared/constants');

function validatePaymentsShape(payments) {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new HttpError(400, 'Debes indicar al menos un método de pago');
  }

  for (const payment of payments) {
    if (!PAYMENT_METHODS.includes(payment.method)) {
      throw new HttpError(400, `Método de pago inválido: ${payment.method}`);
    }
    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      throw new HttpError(400, 'El monto de cada pago debe ser mayor a 0');
    }
  }
}

module.exports = { validatePaymentsShape };
