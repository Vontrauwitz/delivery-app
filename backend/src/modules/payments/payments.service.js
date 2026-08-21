const round2 = require('../../shared/round2');

function sumPayments(payments) {
  return round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
}

function validatePaymentsMatchTotal(payments, total) {
  return sumPayments(payments) === round2(total);
}

module.exports = { sumPayments, validatePaymentsMatchTotal };
