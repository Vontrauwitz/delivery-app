const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    icon: { type: String, default: '' },
    basePrice: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    // Explicit display order for the driver's product grid — insertion order/createdAt is not
    // reliable for products created in the same seed batch (same-millisecond timestamps).
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
