const mongoose = require('mongoose');
const { ACCOUNTING_PERIOD_STATUSES } = require('../../shared/constants');

const accountingPeriodSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(ACCOUNTING_PERIOD_STATUSES),
      default: ACCOUNTING_PERIOD_STATUSES.OPEN,
    },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Exactly one OPEN accounting period at a time, for the whole business (not per vehicle).
accountingPeriodSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: ACCOUNTING_PERIOD_STATUSES.OPEN } }
);
accountingPeriodSchema.index({ startedAt: -1 });

module.exports = mongoose.model('AccountingPeriod', accountingPeriodSchema);
