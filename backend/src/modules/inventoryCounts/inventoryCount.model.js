const mongoose = require('mongoose');
const { INVENTORY_COUNT_TYPES } = require('../../shared/constants');

const countItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityCounted: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const expectedItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantityExpected: { type: Number, required: true },
  },
  { _id: false }
);

const inventoryCountSchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inventorySession: { type: mongoose.Schema.Types.ObjectId, ref: 'InventorySession', required: true },
    type: {
      type: String,
      enum: Object.values(INVENTORY_COUNT_TYPES),
      required: true,
    },
    // Physical count reported. Never overwrites the expected inventory calculation.
    counts: { type: [countItemSchema], required: true },
    // Snapshot of the expected inventory at the moment this count was taken.
    expectedAtCountTime: { type: [expectedItemSchema], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

inventoryCountSchema.index({ inventorySession: 1 });
inventoryCountSchema.index({ vehicle: 1 });
inventoryCountSchema.index({ driver: 1 });
inventoryCountSchema.index({ type: 1 });

module.exports = mongoose.model('InventoryCount', inventoryCountSchema);
