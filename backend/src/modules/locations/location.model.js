const mongoose = require('mongoose');

// Append-only ping log (never updated, never deleted) — "latest per driver" is a query, not a
// separate mutable record, and the log doubles as a simple recent-history trail for free.
const locationPingSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number },
  // Device-reported time, optional — informational only, never used for freshness (the
  // device clock isn't trustworthy). serverTimestamp is the source of truth.
  clientTimestamp: { type: Date },
  serverTimestamp: { type: Date, required: true, default: Date.now },
});

locationPingSchema.index({ driver: 1, serverTimestamp: -1 });

module.exports = mongoose.model('LocationPing', locationPingSchema);
