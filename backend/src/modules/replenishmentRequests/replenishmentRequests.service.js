const ReplenishmentRequest = require('./replenishmentRequest.model');
const productsService = require('../products/products.service');
const usersService = require('../users/users.service');
const vehiclesService = require('../vehicles/vehicles.service');
const auditService = require('../audit/audit.service');
const HttpError = require('../../shared/httpError');
const { REPLENISHMENT_REQUEST_STATUSES: STATUS } = require('../../shared/constants');

// No existing free-text field in the project (Dispatch.note, Message.body) enforces a length
// bound today — this is a new, deliberately generous convention introduced for this module only,
// not a pre-existing project-wide limit.
const NOTE_MAX_LENGTH = 1000;

// Validates the raw item list against the domain rules (non-empty, existing+active products, no
// duplicate products, positive-integer quantities) and resolves each into the persisted shape
// (with its productSnapshot). Runs on create and on every DRAFT edit that touches items — never
// on a state transition, which must never re-validate or mutate ticket contents.
async function resolveAndValidateItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'La solicitud debe incluir al menos un producto');
  }

  const seenProductIds = new Set();
  const items = [];

  for (const raw of rawItems) {
    const productId = raw && raw.product;
    if (!productId) {
      throw new HttpError(400, 'Cada ítem debe indicar un producto');
    }

    const key = String(productId);
    if (seenProductIds.has(key)) {
      throw new HttpError(400, 'No se puede repetir el mismo producto en una solicitud');
    }
    seenProductIds.add(key);

    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new HttpError(400, 'La cantidad debe ser un número entero positivo');
    }

    const product = await productsService.getProductById(productId);
    if (!product) {
      throw new HttpError(400, 'Uno o más productos no existen');
    }
    if (!product.active) {
      throw new HttpError(400, `El producto "${product.name}" está inactivo`);
    }

    items.push({ product: product._id, productSnapshot: { name: product.name }, quantity });
  }

  return items;
}

// Resolves and cross-validates the optional driver/vehicle pair via the owning modules'
// services (never their Mongoose models directly). Only checks the assignment relationship
// when BOTH are provided — either one alone is always valid on its own.
async function resolveDriverAndVehicle({ driver, vehicle }) {
  let driverId = null;
  let vehicleDoc = null;

  if (driver) {
    const driverUser = await usersService.findDriverById(driver);
    if (!driverUser) {
      throw new HttpError(400, 'Chofer inválido');
    }
    driverId = driverUser._id;
  }

  if (vehicle) {
    try {
      vehicleDoc = await vehiclesService.getVehicleById(vehicle);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        throw new HttpError(400, 'Vehículo inválido');
      }
      throw err;
    }

    if (driverId) {
      const assignedDriverId = vehicleDoc.assignedDriver?._id || vehicleDoc.assignedDriver;
      if (!assignedDriverId || String(assignedDriverId) !== String(driverId)) {
        throw new HttpError(400, 'El vehículo no está asignado a ese chofer');
      }
    }
  }

  return { driverId, vehicleId: vehicleDoc ? vehicleDoc._id : null };
}

function validateNote(note) {
  if (note === undefined || note === null || note === '') {
    return '';
  }
  if (typeof note !== 'string') {
    throw new HttpError(400, 'La nota debe ser texto');
  }
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new HttpError(400, `La nota no puede exceder ${NOTE_MAX_LENGTH} caracteres`);
  }
  return trimmed;
}

// AuditLog metadata only — product ids/quantities and driver/vehicle ids, never the note.
function snapshotForAudit(doc) {
  return {
    driver: doc.driver ? String(doc.driver) : null,
    vehicle: doc.vehicle ? String(doc.vehicle) : null,
    items: doc.items.map((i) => ({ product: String(i.product), quantity: i.quantity })),
    status: doc.status,
  };
}

// Deterministic, trusted-data-only share text — see PLAN.md's SIGUIENTE FASE PLANIFICADA. Takes
// only the persisted (already-populated) ticket; there is no way to pass an arbitrary client
// message through this function. Optional lines (driver/vehicle/note) are omitted cleanly when
// absent; item order/formatting always follows the ticket's own stored item order.
function buildShareText(ticket) {
  const lines = ['Pedido de reabastecimiento', ''];

  const driverName = ticket.driver && ticket.driver.name;
  const vehicleName = ticket.vehicle && ticket.vehicle.name;
  if (driverName) lines.push(`Chofer: ${driverName}`);
  if (vehicleName) lines.push(`Vehículo: ${vehicleName}`);
  if (driverName || vehicleName) lines.push('');

  for (const item of ticket.items) {
    lines.push(`- ${item.productSnapshot.name} x${item.quantity}`);
  }

  if (ticket.note) {
    lines.push('');
    lines.push(`Notas: ${ticket.note}`);
  }

  return lines.join('\n');
}

// Computed at read time, never persisted — same "don't store the derivable" principle as
// Dispatch's mapsUrl and LocationPing's isStale.
function withShareText(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.shareText = buildShareText(obj);
  return obj;
}

// Used by products.service's isProductReferenced (via a lazy require there, to avoid a circular
// dependency) so a product referenced by any ticket — regardless of status, including terminal
// ones — cannot be hard-deleted. Deactivation is a separate, always-allowed path; this only
// blocks the destructive one.
async function isProductReferenced(productId) {
  return ReplenishmentRequest.exists({ 'items.product': productId });
}

async function loadOrFail(id) {
  const ticket = await ReplenishmentRequest.findById(id);
  if (!ticket) {
    throw new HttpError(404, 'Solicitud de reabastecimiento no encontrada');
  }
  return ticket;
}

async function getRequestById(id) {
  const ticket = await ReplenishmentRequest.findById(id)
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('requestedBy', 'name email');

  if (!ticket) {
    throw new HttpError(404, 'Solicitud de reabastecimiento no encontrada');
  }
  return withShareText(ticket);
}

async function listRequests(filter = {}) {
  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.driver) query.driver = filter.driver;
  if (filter.vehicle) query.vehicle = filter.vehicle;
  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from) query.createdAt.$gte = new Date(filter.from);
    if (filter.to) query.createdAt.$lte = new Date(filter.to);
  }

  const tickets = await ReplenishmentRequest.find(query)
    .sort({ createdAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('requestedBy', 'name email');

  return tickets.map(withShareText);
}

async function createRequest({ requestedBy, driver, vehicle, items: rawItems, note }) {
  const items = await resolveAndValidateItems(rawItems);
  const { driverId, vehicleId } = await resolveDriverAndVehicle({ driver, vehicle });
  const cleanNote = validateNote(note);

  const ticket = await ReplenishmentRequest.create({
    requestedBy,
    driver: driverId,
    vehicle: vehicleId,
    items,
    note: cleanNote,
    status: STATUS.DRAFT,
  });

  await auditService.logChange({
    entity: 'ReplenishmentRequest',
    entityId: ticket._id,
    action: 'REPLENISHMENT_REQUEST_CREATED',
    changes: [{ field: 'replenishmentRequest', oldValue: null, newValue: snapshotForAudit(ticket) }],
    performedBy: requestedBy,
  });

  return getRequestById(ticket._id);
}

// Only DRAFT tickets reach this far (checked first, before anything else runs) — SENT/FULFILLED/
// CANCELLED are immutable except via the transition functions below. Only the fields actually
// present in `updates` are touched, so unrelated fields (and definitely status/requestedBy/
// timestamps, which this endpoint never exposes at the controller level) can never be changed
// through this path. A call that changes nothing writes neither a save nor an audit event.
async function updateDraft(id, updates, actorId) {
  const ticket = await loadOrFail(id);
  if (ticket.status !== STATUS.DRAFT) {
    throw new HttpError(400, `Solo se puede editar una solicitud en estado DRAFT (estado actual: ${ticket.status})`);
  }

  const beforeDriver = ticket.driver ? String(ticket.driver) : null;
  const beforeVehicle = ticket.vehicle ? String(ticket.vehicle) : null;
  const beforeItems = ticket.items.map((i) => ({ product: String(i.product), quantity: i.quantity }));

  if (updates.items !== undefined) {
    ticket.items = await resolveAndValidateItems(updates.items);
  }
  if (updates.driver !== undefined || updates.vehicle !== undefined) {
    const { driverId, vehicleId } = await resolveDriverAndVehicle({
      driver: updates.driver !== undefined ? updates.driver : ticket.driver,
      vehicle: updates.vehicle !== undefined ? updates.vehicle : ticket.vehicle,
    });
    ticket.driver = driverId;
    ticket.vehicle = vehicleId;
  }

  let noteChanged = false;
  if (updates.note !== undefined) {
    const cleanNote = validateNote(updates.note);
    noteChanged = cleanNote !== ticket.note;
    ticket.note = cleanNote;
  }

  const afterDriver = ticket.driver ? String(ticket.driver) : null;
  const afterVehicle = ticket.vehicle ? String(ticket.vehicle) : null;
  const afterItems = ticket.items.map((i) => ({ product: String(i.product), quantity: i.quantity }));

  const changes = [];
  if (afterDriver !== beforeDriver) changes.push({ field: 'driver', oldValue: beforeDriver, newValue: afterDriver });
  if (afterVehicle !== beforeVehicle) changes.push({ field: 'vehicle', oldValue: beforeVehicle, newValue: afterVehicle });
  if (JSON.stringify(beforeItems) !== JSON.stringify(afterItems)) {
    changes.push({ field: 'items', oldValue: beforeItems, newValue: afterItems });
  }
  // Presence-only — the note's actual text is deliberately excluded from AuditLog.
  if (noteChanged) changes.push({ field: 'note', oldValue: null, newValue: null });

  if (changes.length === 0) {
    return getRequestById(ticket._id);
  }

  await ticket.save();

  await auditService.logChange({
    entity: 'ReplenishmentRequest',
    entityId: ticket._id,
    action: 'REPLENISHMENT_REQUEST_UPDATED',
    changes,
    performedBy: actorId,
  });

  return getRequestById(ticket._id);
}

async function sendRequest(id, actorId) {
  const ticket = await loadOrFail(id);
  if (ticket.status !== STATUS.DRAFT) {
    throw new HttpError(400, `Solo se puede enviar una solicitud en estado DRAFT (estado actual: ${ticket.status})`);
  }

  const previousStatus = ticket.status;
  ticket.status = STATUS.SENT;
  ticket.sentAt = new Date();
  await ticket.save();

  await auditService.logChange({
    entity: 'ReplenishmentRequest',
    entityId: id,
    action: 'REPLENISHMENT_REQUEST_SENT',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: ticket.status }],
    performedBy: actorId,
  });

  return getRequestById(id);
}

async function fulfillRequest(id, actorId) {
  const ticket = await loadOrFail(id);
  if (ticket.status !== STATUS.SENT) {
    throw new HttpError(400, `Solo se puede marcar como cumplida una solicitud en estado SENT (estado actual: ${ticket.status})`);
  }

  const previousStatus = ticket.status;
  ticket.status = STATUS.FULFILLED;
  ticket.fulfilledAt = new Date();
  await ticket.save();

  await auditService.logChange({
    entity: 'ReplenishmentRequest',
    entityId: id,
    action: 'REPLENISHMENT_REQUEST_FULFILLED',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: ticket.status }],
    performedBy: actorId,
  });

  return getRequestById(id);
}

async function cancelRequest(id, actorId) {
  const ticket = await loadOrFail(id);
  if (![STATUS.DRAFT, STATUS.SENT].includes(ticket.status)) {
    throw new HttpError(400, `No se puede cancelar una solicitud en estado ${ticket.status}`);
  }

  const previousStatus = ticket.status;
  ticket.status = STATUS.CANCELLED;
  ticket.cancelledAt = new Date();
  await ticket.save();

  await auditService.logChange({
    entity: 'ReplenishmentRequest',
    entityId: id,
    action: 'REPLENISHMENT_REQUEST_CANCELLED',
    changes: [{ field: 'status', oldValue: previousStatus, newValue: ticket.status }],
    performedBy: actorId,
  });

  return getRequestById(id);
}

module.exports = {
  buildShareText,
  createRequest,
  getRequestById,
  listRequests,
  updateDraft,
  sendRequest,
  fulfillRequest,
  cancelRequest,
  isProductReferenced,
};
