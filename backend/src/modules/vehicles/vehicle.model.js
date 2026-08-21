const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

vehicleSchema.index({ assignedDriver: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
