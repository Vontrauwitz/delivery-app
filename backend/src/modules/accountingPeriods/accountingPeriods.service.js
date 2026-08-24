const AccountingPeriod = require('./accountingPeriod.model');
const HttpError = require('../../shared/httpError');
const { ACCOUNTING_PERIOD_STATUSES } = require('../../shared/constants');

async function getCurrentOpenPeriod() {
  const period = await AccountingPeriod.findOne({ status: ACCOUNTING_PERIOD_STATUSES.OPEN });
  if (!period) {
    // Should be unreachable in normal operation (seed creates the first period, and closing
    // always creates the next one in the same operation) — but never silently sell against
    // nothing if it somehow happens.
    throw new HttpError(500, 'No hay un período contable abierto. Contacta a soporte.');
  }
  return period;
}

async function listPeriods() {
  return AccountingPeriod.find()
    .sort({ startedAt: -1 })
    .populate('closedBy', 'name email')
    .populate('createdBy', 'name email');
}

// Closes the current period at "now" and immediately opens the next one starting at that exact
// same timestamp — there is never a gap or overlap between periods. No duration is configured;
// the next period simply stays open until the manager closes it again.
async function closeCurrentPeriod(managerId) {
  const current = await getCurrentOpenPeriod();
  const now = new Date();

  current.status = ACCOUNTING_PERIOD_STATUSES.CLOSED;
  current.endedAt = now;
  current.closedBy = managerId;
  await current.save();

  const next = await AccountingPeriod.create({
    status: ACCOUNTING_PERIOD_STATUSES.OPEN,
    startedAt: now,
    createdBy: managerId,
  });

  return { closed: current, opened: next };
}

module.exports = { getCurrentOpenPeriod, listPeriods, closeCurrentPeriod };
