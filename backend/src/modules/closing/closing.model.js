const mongoose = require('mongoose');
const { CLOSING_STATUSES } = require('../../shared/constants');

const closingSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inventorySession: { type: mongoose.Schema.Types.ObjectId, ref: 'InventorySession', required: true, unique: true },
    inventoryCount: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCount', required: true },
    date: { type: Date, required: true },
    expectedCash: { type: Number, required: true },
    reportedCash: { type: Number, required: true },
    cashDifference: { type: Number, required: true },
    managerNote: { type: String, default: '' },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
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

module.exports = mongoose.model('Closing', closingSchema);
