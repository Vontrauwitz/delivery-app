const mongoose = require('mongoose');
const { SESSION_STATUSES } = require('../../shared/constants');

const stockItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const inventorySessionSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The driver's OPEN WorkShift at the moment the session was opened.
    workShift: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkShift', required: true },
    businessDate: { type: Date, required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date },
    status: {
      type: String,
      enum: Object.values(SESSION_STATUSES),
      default: SESSION_STATUSES.OPEN,
    },
    initialStock: { type: [stockItemSchema], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Only one non-CLOSED session (OPEN or CLOSING_PENDING) per vehicle at a time —
// a vehicle isn't free for a new session until its current one is fully CLOSED.
inventorySessionSchema.index(
  { vehicle: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [SESSION_STATUSES.OPEN, SESSION_STATUSES.CLOSING_PENDING] },
    },
  }
);
inventorySessionSchema.index({ driver: 1 });
inventorySessionSchema.index({ businessDate: 1 });

module.exports = mongoose.model('InventorySession', inventorySessionSchema);
