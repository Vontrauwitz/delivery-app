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
    // Inventory belongs to the driver, not the vehicle — a driver switching vehicles (broken
    // down, reassigned, etc.) never resets, closes, or transfers their inventory. `vehicle` is
    // kept only as a historical snapshot of what the driver was using when the session opened.
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    // The driver's OPEN WorkShift at the moment the session was opened — optional, since a
    // session can now be created automatically (first sale, a manager replenishing stock
    // ahead of the driver's shift) without one existing yet. Purely informational.
    workShift: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkShift' },
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

// Only one non-CLOSED session (OPEN or CLOSING_PENDING) per driver at a time —
// a driver isn't free for a new session until their current one is fully CLOSED.
inventorySessionSchema.index(
  { driver: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [SESSION_STATUSES.OPEN, SESSION_STATUSES.CLOSING_PENDING] },
    },
  }
);
inventorySessionSchema.index({ vehicle: 1 });
inventorySessionSchema.index({ businessDate: 1 });

module.exports = mongoose.model('InventorySession', inventorySessionSchema);
