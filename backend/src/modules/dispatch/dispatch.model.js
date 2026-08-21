const mongoose = require('mongoose');
const { DISPATCH_STATUSES } = require('../../shared/constants');

// Deliberately separate from Sale — a dispatch is "go to this address," not a transaction.
const dispatchSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    destinationLabel: { type: String, required: true },
    address: { type: String, required: true },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(DISPATCH_STATUSES),
      default: DISPATCH_STATUSES.PENDING,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

dispatchSchema.index({ driver: 1, status: 1 });
dispatchSchema.index({ status: 1 });

module.exports = mongoose.model('Dispatch', dispatchSchema);
