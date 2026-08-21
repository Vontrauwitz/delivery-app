const mongoose = require('mongoose');
const { PAYMENT_METHODS, SALE_STATUSES } = require('../../shared/constants');

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [saleItemSchema], required: true },
    subtotalOriginal: { type: Number, required: true, min: 0 },
    adjustment: {
      amount: { type: Number, default: 0 },
      reason: { type: String, default: '' },
    },
    totalFinal: { type: Number, required: true, min: 0 },
    payments: { type: [paymentSchema], required: true },
    status: {
      type: String,
      enum: Object.values(SALE_STATUSES),
      default: SALE_STATUSES.PENDING,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approval: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
    },
    cancellation: {
      reason: String,
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      cancelledAt: Date,
    },
    incident: {
      note: String,
      markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      markedAt: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sale', saleSchema);
