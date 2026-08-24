const mongoose = require('mongoose');
const { PROMOTION_TYPES } = require('../../shared/constants');

const promotionSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    type: {
      type: String,
      enum: Object.values(PROMOTION_TYPES),
      default: PROMOTION_TYPES.QUANTITY_FOR_PRICE,
      required: true,
    },
    quantity: { type: Number, required: true, min: 2 },
    bundlePrice: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    // Reserved for a future scheduling feature (e.g. "2 for $80 until Friday"). Not enforced
    // by the pricing engine yet — a promotion applies whenever `active` is true.
    startDate: { type: Date },
    endDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

promotionSchema.index({ product: 1, active: 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
