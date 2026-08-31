// Provider-agnostic contract for a future route optimizer — Route Planning Foundation checkpoint.
//
// Deliberately UNIMPLEMENTED. Route order is fully manual today (dispatch.service.js
// reorderRoute()); this file exists only to define the shape a future optimizer would fill in,
// so that work can slot in later without redesigning Dispatch or this module's callers. Do not
// wire this into any route/controller until a real implementation exists behind it.
//
// Intended contract:
//
//   optimizeRoute({ origin, stops }) -> Promise<{
//     orderedStopIds: string[],       // every input stop id, reordered — never a subset
//     metadata: {
//       provider: string,             // e.g. 'nearest-neighbor-heuristic', 'google-directions', ...
//       estimatedDistanceMeters?: number,
//       estimatedDurationSeconds?: number,
//     },
//   }>
//
// Where:
//   origin — optional { latitude, longitude } for the starting point (e.g. the driver's last
//            known location). Omitted when unknown — never fabricated.
//   stops  — the candidate stops to order: [{ id, latitude?, longitude?, address }, ...]. A stop
//            without coordinates may still be included; a real implementation would need to
//            decide (and document) how it handles those — this contract does not presume a
//            geocoding provider exists.
//
// A future implementation MUST label its own approach honestly in `metadata.provider` — e.g. a
// simple nearest-neighbor heuristic must say so, never claim to be production-quality routing.
// This module intentionally ships with no implementation at all rather than a fake one.
async function optimizeRoute(/* { origin, stops } */) {
  throw new Error('optimizeRoute is not implemented yet — route order is fully manual in this checkpoint.');
}

module.exports = { optimizeRoute };
