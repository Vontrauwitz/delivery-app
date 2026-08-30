const Dispatch = require('./dispatch.model');
const User = require('../users/user.model');
const HttpError = require('../../shared/httpError');
const auditService = require('../audit/audit.service');
const messagingService = require('../messaging/messaging.service');
const { ROLES, DISPATCH_STATUSES } = require('../../shared/constants');
const vehiclesService = require('../vehicles/vehicles.service');

// A manager-facing batch paste is a convenience for entering many destinations quickly, not a
// bulk-import tool — this keeps a single call bounded and its per-line report readable.
const BATCH_CREATE_MAX = 50;

function withMapsUrl(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.mapsUrl =
    obj.latitude !== undefined && obj.latitude !== null && obj.longitude !== undefined && obj.longitude !== null
      ? `https://maps.google.com/?q=${obj.latitude},${obj.longitude}`
      : `https://maps.google.com/?q=${encodeURIComponent(obj.address)}`;
  return obj;
}

function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

async function resolveDriverForAssignment(driverId) {
  const driver = await User.findOne({ _id: driverId, role: ROLES.DRIVER, active: true });
  if (!driver) {
    throw new HttpError(400, 'Chofer inválido o inactivo');
  }
  return driver;
}

async function createDispatch({ driverId, vehicleId, destinationLabel, address, latitude, longitude, note, createdBy }) {
  if (destinationLabel !== undefined && destinationLabel !== null && !destinationLabel.trim()) {
    throw new HttpError(400, 'La referencia no puede ser un texto vacío');
  }
  if (!address || !address.trim()) {
    throw new HttpError(400, 'La dirección es requerida');
  }
  const hasLat = latitude !== undefined && latitude !== null;
  const hasLng = longitude !== undefined && longitude !== null;
  if (hasLat !== hasLng) {
    throw new HttpError(400, 'latitude y longitude deben proporcionarse juntas');
  }
  if (hasLat && !isValidCoordinate(Number(latitude), Number(longitude))) {
    throw new HttpError(400, 'Coordenadas inválidas');
  }

  // driverId is optional now — omitting it creates an UNASSIGNED destination in the operational
  // pool (Mapa Operativo checkpoint). Providing one keeps the original behavior byte-for-byte:
  // the dispatch starts PENDING, with its vehicle resolved the same way it always was.
  let driver = null;
  let vehicle = null;
  if (driverId) {
    driver = await resolveDriverForAssignment(driverId);
    vehicle = vehicleId ? await vehiclesService.getVehicleById(vehicleId) : await vehiclesService.getActiveVehicleForDriver(driverId);
  }

  const dispatch = await Dispatch.create({
    driver: driver ? driver._id : null,
    vehicle: vehicle ? vehicle._id : undefined,
    destinationLabel: (destinationLabel || '').trim(),
    address: address.trim(),
    latitude: hasLat ? Number(latitude) : undefined,
    longitude: hasLng ? Number(longitude) : undefined,
    note: (note || '').trim(),
    status: driver ? DISPATCH_STATUSES.PENDING : DISPATCH_STATUSES.UNASSIGNED,
    createdBy,
  });

  // Snapshot excludes `note` — free-text instructions aren't audit metadata and may carry
  // details (a gate code, a phone number) that don't belong duplicated into the audit trail.
  await auditService.logChange({
    entity: 'Dispatch',
    entityId: dispatch._id,
    action: 'DISPATCH_CREATED',
    changes: [
      {
        field: 'dispatch',
        oldValue: null,
        newValue: { driver: driver ? driver._id : null, address: dispatch.address, destinationLabel: dispatch.destinationLabel, status: dispatch.status },
      },
    ],
    performedBy: createdBy,
  });

  return getDispatchById(dispatch._id);
}

// Not atomic on purpose — one malformed or failing line in a large paste must never block the
// rest. Each cleaned line is created independently through the exact same createDispatch() path
// (always UNASSIGNED, since a batch paste never carries a driver), and the caller gets a
// per-line report instead of one opaque error for the whole paste. Blank lines are dropped
// silently (never reported as a failure) — "ignore blank lines" means they were never real input.
async function createBatch({ destinations, createdBy }) {
  if (!Array.isArray(destinations)) {
    throw new HttpError(400, 'destinations debe ser una lista de direcciones');
  }

  const cleaned = destinations
    .map((raw) => (typeof raw === 'string' ? raw : raw?.address || ''))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (cleaned.length === 0) {
    throw new HttpError(400, 'Debes indicar al menos una dirección válida');
  }
  if (cleaned.length > BATCH_CREATE_MAX) {
    throw new HttpError(400, `No se pueden crear más de ${BATCH_CREATE_MAX} destinos a la vez`);
  }

  const results = [];
  for (let i = 0; i < cleaned.length; i++) {
    try {
      const dispatch = await createDispatch({ address: cleaned[i], createdBy });
      results.push({ index: i, address: cleaned[i], status: 'created', dispatch });
    } catch (err) {
      results.push({ index: i, address: cleaned[i], status: 'error', error: err.message });
    }
  }

  return {
    createdCount: results.filter((r) => r.status === 'created').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    results,
  };
}

async function loadDispatchOrFail(id) {
  const dispatch = await Dispatch.findById(id);
  if (!dispatch) {
    throw new HttpError(404, 'Dispatch no encontrado');
  }
  return dispatch;
}

// The next stop, per driver, among their currently active (not yet completed/cancelled)
// dispatches — a minimal, monotonically-increasing sequence, not a real route optimization.
async function nextRouteOrderForDriver(driverId) {
  const last = await Dispatch.findOne({
    driver: driverId,
    status: { $in: [DISPATCH_STATUSES.PENDING, DISPATCH_STATUSES.ACCEPTED] },
  })
    .sort({ routeOrder: -1 })
    .select('routeOrder');
  return (last?.routeOrder || 0) + 1;
}

// Assign (UNASSIGNED -> PENDING) or reassign (PENDING -> PENDING, different driver) — the same
// operation from the manager's point of view, and server-authoritative either way: the dispatch's
// CURRENT status is re-checked here, not trusted from whatever the caller last saw.
async function assignDispatch(id, driverId, actorId) {
  const dispatch = await loadDispatchOrFail(id);
  if (![DISPATCH_STATUSES.UNASSIGNED, DISPATCH_STATUSES.PENDING].includes(dispatch.status)) {
    throw new HttpError(400, `No se puede asignar un dispatch en estado ${dispatch.status}`);
  }

  const driver = await resolveDriverForAssignment(driverId);
  const previousStatus = dispatch.status;
  const previousDriver = dispatch.driver;
  const isReassignment = previousStatus === DISPATCH_STATUSES.PENDING;

  if (isReassignment && previousDriver && String(previousDriver) === String(driver._id)) {
    // Assigning to the same driver again is a no-op — nothing changes, no audit noise.
    return getDispatchById(id);
  }

  const vehicle = await vehiclesService.getActiveVehicleForDriver(driver._id);

  dispatch.driver = driver._id;
  dispatch.vehicle = vehicle ? vehicle._id : undefined;
  dispatch.status = DISPATCH_STATUSES.PENDING;
  if (dispatch.routeOrder == null) {
    dispatch.routeOrder = await nextRouteOrderForDriver(driver._id);
  }
  await dispatch.save();

  await auditService.logChange({
    entity: 'Dispatch',
    entityId: id,
    action: isReassignment ? 'DISPATCH_REASSIGNED' : 'DISPATCH_ASSIGNED',
    changes: [{ field: 'driver', oldValue: previousDriver, newValue: dispatch.driver }],
    performedBy: actorId,
  });

  return getDispatchById(id);
}

// Server-authoritative per item: each id is re-validated at the moment of assignment, not just
// filtered from a client-supplied list. If one item was concurrently accepted/completed/
// cancelled since the manager selected it, that item is reported as failed rather than aborting
// the whole batch or silently dropping it without explanation.
async function batchAssign(ids, driverId, actorId) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpError(400, 'Debes seleccionar al menos un dispatch');
  }

  await resolveDriverForAssignment(driverId);

  const assigned = [];
  const failed = [];
  for (const id of ids) {
    try {
      assigned.push(await assignDispatch(id, driverId, actorId));
    } catch (err) {
      failed.push({ id, error: err.message });
    }
  }

  return { assigned, failed };
}

const DESTINATION_EDITABLE_STATUSES = [DISPATCH_STATUSES.UNASSIGNED, DISPATCH_STATUSES.PENDING, DISPATCH_STATUSES.ACCEPTED];

// A customer correcting their address mid-delivery updates the SAME Dispatch — never a
// replacement. Preserves assigned driver, current status, and routeOrder unconditionally; never
// reassigns, never touches ACCEPTED/COMPLETED/CANCELLED transitions. If the text address changes
// without new coordinates in the same request, old coordinates are cleared (never left stale,
// never fabricated) — see the module-level note on this checkpoint's coordinate policy.
async function updateDestination(id, { address, destinationLabel, latitude, longitude }, actorId) {
  const dispatch = await loadDispatchOrFail(id);
  if (!DESTINATION_EDITABLE_STATUSES.includes(dispatch.status)) {
    throw new HttpError(400, `No se puede editar el destino de un dispatch en estado ${dispatch.status}`);
  }

  const changes = [];
  const beforeAddress = dispatch.address;
  const beforeHadCoords = dispatch.latitude != null && dispatch.longitude != null;

  let addressChanged = false;
  if (address !== undefined) {
    const trimmed = address.trim();
    if (!trimmed) {
      throw new HttpError(400, 'La dirección no puede quedar vacía');
    }
    if (trimmed !== dispatch.address) {
      addressChanged = true;
      dispatch.address = trimmed;
    }
  }

  if (destinationLabel !== undefined) {
    const trimmedLabel = destinationLabel.trim();
    if (trimmedLabel !== dispatch.destinationLabel) {
      changes.push({ field: 'destinationLabel', oldValue: dispatch.destinationLabel, newValue: trimmedLabel });
      dispatch.destinationLabel = trimmedLabel;
    }
  }

  const hasNewCoords = latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null;
  let coordinatesOutcome = null; // 'updated' | 'cleared'

  if (hasNewCoords) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isValidCoordinate(lat, lng)) {
      throw new HttpError(400, 'Coordenadas inválidas');
    }
    if (lat !== dispatch.latitude || lng !== dispatch.longitude) {
      dispatch.latitude = lat;
      dispatch.longitude = lng;
      coordinatesOutcome = 'updated';
    }
  } else if (addressChanged && beforeHadCoords) {
    dispatch.latitude = undefined;
    dispatch.longitude = undefined;
    coordinatesOutcome = 'cleared';
  }

  if (addressChanged) {
    changes.push({ field: 'address', oldValue: beforeAddress, newValue: dispatch.address });
  }
  if (coordinatesOutcome) {
    changes.push({ field: 'coordinates', oldValue: beforeHadCoords ? 'present' : 'absent', newValue: coordinatesOutcome === 'cleared' ? 'cleared' : 'present' });
  }

  if (changes.length === 0) {
    return getDispatchById(id);
  }

  await dispatch.save();

  // Audit fires unconditionally right after the save, exactly like every other mutation in this
  // file (assign/accept/complete/cancel) — the destination update is the business operation of
  // record, and it must be recorded regardless of whether the best-effort notification below
  // succeeds or fails.
  await auditService.logChange({
    entity: 'Dispatch',
    entityId: id,
    action: 'DISPATCH_DESTINATION_UPDATED',
    changes,
    performedBy: actorId,
  });

  // Notify the assigned driver only when something about WHERE they're going actually changed —
  // a destinationLabel-only edit (just the customer/reference name) doesn't affect the route.
  // Uses the existing messaging infrastructure exactly as-is — no new notification channel.
  // Best-effort: the destination correction is already saved and audited above, so a messaging
  // failure (e.g. a transient DB error) must never roll back or mask a successful business update
  // — it's logged and swallowed instead of thrown, matching how the rest of this checkpoint
  // treats notification as a side effect of the update, not a precondition for it.
  if (dispatch.driver && (addressChanged || coordinatesOutcome)) {
    try {
      await messagingService.sendMessage({
        senderId: actorId,
        recipientIds: [dispatch.driver],
        subject: 'Dirección actualizada',
        body: 'Se actualizó la dirección de una de tus paradas.',
        important: false,
      });
    } catch (err) {
      console.error(`Failed to notify driver ${dispatch.driver} of destination update on dispatch ${id}`, err);
    }
  }

  return getDispatchById(id);
}

async function acceptDispatch(id, driverId) {
  const dispatch = await loadDispatchOrFail(id);

  if (String(dispatch.driver) !== String(driverId)) {
    throw new HttpError(403, 'No puedes aceptar el dispatch de otro chofer');
  }
  if (dispatch.status !== DISPATCH_STATUSES.PENDING) {
    throw new HttpError(400, `No se puede aceptar un dispatch en estado ${dispatch.status}`);
  }

  const previousStatus = dispatch.status;
  dispatch.status = DISPATCH_STATUSES.ACCEPTED;
  dispatch.acceptedAt = new Date();
  await dispatch.save();

  await auditService.logChange({
    entity: 'Dispatch',
    entityId: id,
    action: 'DISPATCH_ACCEPTED',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: dispatch.status }],
    performedBy: driverId,
  });

  return getDispatchById(id);
}

async function completeDispatch(id, driverId) {
  const dispatch = await loadDispatchOrFail(id);

  if (String(dispatch.driver) !== String(driverId)) {
    throw new HttpError(403, 'No puedes completar el dispatch de otro chofer');
  }
  if (dispatch.status !== DISPATCH_STATUSES.ACCEPTED) {
    throw new HttpError(400, `Solo se puede completar un dispatch ACCEPTED (estado actual: ${dispatch.status})`);
  }

  const previousStatus = dispatch.status;
  dispatch.status = DISPATCH_STATUSES.COMPLETED;
  dispatch.completedAt = new Date();
  await dispatch.save();

  await auditService.logChange({
    entity: 'Dispatch',
    entityId: id,
    action: 'DISPATCH_COMPLETED',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: dispatch.status }],
    performedBy: driverId,
  });

  return getDispatchById(id);
}

async function cancelDispatch(id, managerId) {
  const dispatch = await loadDispatchOrFail(id);

  // UNASSIGNED included — a bad pool entry (typo, duplicate paste) must be removable without
  // ever assigning it to anyone first.
  if (![DISPATCH_STATUSES.UNASSIGNED, DISPATCH_STATUSES.PENDING, DISPATCH_STATUSES.ACCEPTED].includes(dispatch.status)) {
    throw new HttpError(400, `No se puede cancelar un dispatch en estado ${dispatch.status}`);
  }

  const previousStatus = dispatch.status;
  dispatch.status = DISPATCH_STATUSES.CANCELLED;
  dispatch.cancelledAt = new Date();
  dispatch.cancelledBy = managerId;
  await dispatch.save();

  await auditService.logChange({
    entity: 'Dispatch',
    entityId: id,
    action: 'DISPATCH_CANCELLED',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: dispatch.status }],
    performedBy: managerId,
  });

  return getDispatchById(id);
}

async function getDispatchById(id) {
  const dispatch = await Dispatch.findById(id)
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email')
    .populate('cancelledBy', 'name email');

  if (!dispatch) {
    throw new HttpError(404, 'Dispatch no encontrado');
  }

  return withMapsUrl(dispatch);
}

// Never returns UNASSIGNED dispatches for anyone — the query is always scoped to this specific
// driver's own id, and UNASSIGNED dispatches have driver: null, so they can never match. A
// reassigned dispatch (driver field changed) simply falls out of the old driver's results and
// into the new one's on the very next call — no separate "access" concept to maintain.
async function listForDriver(driverId) {
  const dispatches = await Dispatch.find({ driver: driverId })
    .sort({ createdAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email');

  return dispatches.map(withMapsUrl);
}

async function listAll(filter = {}) {
  const dispatches = await Dispatch.find(filter)
    .sort({ createdAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email')
    .populate('cancelledBy', 'name email');

  return dispatches.map(withMapsUrl);
}

module.exports = {
  createDispatch,
  createBatch,
  assignDispatch,
  batchAssign,
  updateDestination,
  acceptDispatch,
  completeDispatch,
  cancelDispatch,
  getDispatchById,
  listForDriver,
  listAll,
};
