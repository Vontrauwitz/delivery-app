const mongoose = require('mongoose');

// Per-product override of the replenishment formula's coverageDays/safetyStock. A product
// with no document here uses REPLENISHMENT_DEFAULTS. Deliberately separate from Product (per
// Phase 3 instructions: "do not modify Product to store inventory" — this isn't inventory, but
// keeping it out of the Product schema keeps that module free of replenishment concerns too).
const replenishmentConfigSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    coverageDays: { type: Number, required: true, min: 0 },
    safetyStock: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReplenishmentConfig', replenishmentConfigSchema);
