const mongoose = require('mongoose');
const { CLOSING_STATUSES } = require('../../shared/constants');

const closingSchema = new mongoose.Schema(
  {
    // Informational snapshot only (inventory belongs to the driver, never the vehicle).
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Not unique: a REOPENED closing stays as a frozen historical record, and the driver's
    // resubmission creates a new Closing document referencing the same session.
    inventorySession: { type: mongoose.Schema.Types.ObjectId, ref: 'InventorySession', required: true },
    inventoryCount: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCount', required: true },
    date: { type: Date, required: true },
    expectedCash: { type: Number, required: true },
    reportedCash: { type: Number, required: true },
    cashDifference: { type: Number, required: true },
    managerNote: { type: String, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reopenedAt: { type: Date },
    reopenReason: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(CLOSING_STATUSES),
      default: CLOSING_STATUSES.OPEN,
    },
  },
  { timestamps: true }
);

closingSchema.index({ vehicle: 1 });
closingSchema.index({ driver: 1 });
closingSchema.index({ status: 1 });
closingSchema.index({ inventorySession: 1 });

module.exports = mongoose.model('Closing', closingSchema);
