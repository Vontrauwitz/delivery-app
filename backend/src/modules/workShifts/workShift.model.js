const mongoose = require('mongoose');
const { WORK_SHIFT_STATUSES } = require('../../shared/constants');

const workShiftSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date },
    status: {
      type: String,
      enum: Object.values(WORK_SHIFT_STATUSES),
      default: WORK_SHIFT_STATUSES.OPEN,
    },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// Only one OPEN shift per driver at a time.
workShiftSchema.index(
  { driver: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: WORK_SHIFT_STATUSES.OPEN } }
);
workShiftSchema.index({ vehicle: 1, status: 1 });
workShiftSchema.index({ startedAt: 1 });

module.exports = mongoose.model('WorkShift', workShiftSchema);
