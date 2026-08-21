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
    // Optional: INITIAL/PARTIAL/CLOSING always set this (session.driver at count time).
    // WEEKLY counts aren't tied to one business day/session, so a vehicle with no assigned
    // driver can still be counted — driver is then left unset.
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Optional: INITIAL/PARTIAL/CLOSING always set this (the session the count belongs to).
    // WEEKLY is a vehicle-level audit that may span/outlive a single InventorySession, so it
    // has none.
    inventorySession: { type: mongoose.Schema.Types.ObjectId, ref: 'InventorySession' },
    // Only set for WEEKLY: the date/week this count represents (report grouping is derived
    // from it). INITIAL/PARTIAL/CLOSING already have session.businessDate + createdAt.
    businessDate: { type: Date },
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
inventoryCountSchema.index({ vehicle: 1, type: 1, businessDate: -1 });

module.exports = mongoose.model('InventoryCount', inventoryCountSchema);
