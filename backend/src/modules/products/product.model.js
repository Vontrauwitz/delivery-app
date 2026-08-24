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
    // Set ONLY by the seed script, to recognize "this is the same demo product" across repeated
    // runs independent of name/price/icon (which a manager may edit freely without the seed
    // script mistaking the edited product for missing). Absent for any product created through
    // the app itself — sparse+unique so those never collide with each other or a seed slot.
    seedKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
