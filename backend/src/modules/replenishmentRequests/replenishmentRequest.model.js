const mongoose = require('mongoose');
const { REPLENISHMENT_REQUEST_STATUSES } = require('../../shared/constants');

// productSnapshot is the minimal trusted data captured at the moment an item is added/edited —
// just enough (the name) for the ticket to stay readable on its own if the product is later
// renamed or deactivated. Nothing else about the product is duplicated. A product referenced
// here can never be hard-deleted (see products.service.isProductReferenced), so this ticket's
// `product` reference itself never dangles — the snapshot exists for the rename/deactivate case,
// not to paper over a missing product.
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productSnapshot: {
      name: { type: String, required: true },
    },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const replenishmentRequestSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    items: {
      type: [itemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'La solicitud debe incluir al menos un producto',
      },
    },
    status: {
      type: String,
      enum: Object.values(REPLENISHMENT_REQUEST_STATUSES),
      default: REPLENISHMENT_REQUEST_STATUSES.DRAFT,
    },
    note: { type: String, default: '' },
    sentAt: { type: Date },
    fulfilledAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

replenishmentRequestSchema.index({ status: 1 });
replenishmentRequestSchema.index({ driver: 1 });
replenishmentRequestSchema.index({ vehicle: 1 });

module.exports = mongoose.model('ReplenishmentRequest', replenishmentRequestSchema);
