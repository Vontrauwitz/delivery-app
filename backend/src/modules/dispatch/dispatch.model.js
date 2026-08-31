const mongoose = require('mongoose');
const { DISPATCH_STATUSES } = require('../../shared/constants');

// Deliberately separate from Sale — a dispatch is "go to this address," not a transaction.
//
// Mapa Operativo checkpoint: `driver` became optional — a dispatch created without one starts
// UNASSIGNED in the operational pool, exactly like one created with a driver still starts
// PENDING (unchanged, backward-compatible behavior). `routeOrder` is a minimal, manager-invisible
// sequence number set at assignment time so a future stop-reordering/route-optimization feature
// has something to read without a Dispatch schema change.
//
// Route Planning Foundation checkpoint: `routeOrder` is now actually reorderable by the manager
// (dispatch.service.js reorderRoute()) — still no automatic optimization, purely manual. Added
// `originalAddress` (see below) for destination-normalization purposes. `coordinateSource` is
// deliberately NOT a persisted field — it's fully derivable from whether latitude/longitude are
// present, so it's computed in withMapsUrl() at read time instead, the same way `mapsUrl` itself
// already is. This is also the extension point a future geocoding provider would slot into: it
// would just start setting a `'GEOCODED'` value there instead of `'MANUAL'`.
const dispatchSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    // Optional customer/reference label ("Cliente VIP", "Bodega Norte") — address is what's
    // actually required to send a driver somewhere; this is just a human-friendly reference the
    // manager can skip. UI falls back to showing the address itself when this is blank.
    destinationLabel: { type: String, default: '' },
    address: { type: String, required: true },
    // The raw address text as first entered by the manager, captured once at creation and never
    // touched by later corrections — `address` above is the current/display value that
    // updateDestination() mutates in place. No default/required so pre-existing records (created
    // before this field existed) simply lack it; dispatch.service.js's response enrichment falls
    // back to `address` for those, which is the closest honest answer available for old records.
    originalAddress: { type: String },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    note: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(DISPATCH_STATUSES),
      default: DISPATCH_STATUSES.UNASSIGNED,
    },
    routeOrder: { type: Number, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

dispatchSchema.index({ driver: 1, status: 1 });
dispatchSchema.index({ status: 1 });

module.exports = mongoose.model('Dispatch', dispatchSchema);
