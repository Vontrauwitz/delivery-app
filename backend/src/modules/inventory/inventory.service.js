const InventorySession = require('./inventorySession.model');
const Product = require('../products/product.model');
const Sale = require('../sales/sale.model');
const vehiclesService = require('../vehicles/vehicles.service');
const workShiftsService = require('../workShifts/workShifts.service');
const HttpError = require('../../shared/httpError');
const {
  SESSION_STATUSES,
  ACTIVE_SESSION_STATUSES,
  INVENTORY_AFFECTING_SALE_STATUSES,
} = require('../../shared/constants');
const auditService = require('../audit/audit.service');

async function normalizeStockInput(rawStock) {
  if (!Array.isArray(rawStock) || rawStock.length === 0) {
    throw new HttpError(400, 'Debes indicar el stock inicial de al menos un producto');
  }

  const result = [];
  const seen = new Set();

  for (const entry of rawStock) {
    const quantity = Number(entry?.quantity);
    if (!entry?.product || !Number.isFinite(quantity) || quantity < 0) {
      throw new HttpError(400, 'Cada producto del stock inicial debe tener una cantidad válida (>= 0)');
    }

    const product = await Product.findById(entry.product);
    if (!product) {
      throw new HttpError(400, `Producto no encontrado: ${entry.product}`);
    }

    const key = String(product._id);
    if (seen.has(key)) {
      throw new HttpError(400, 'Hay un producto duplicado en el stock inicial');
    }
    seen.add(key);

    result.push({ product: product._id, quantity });
  }

  return result;
}

async function getOpenSessionForVehicle(vehicleId) {
  return InventorySession.findOne({ vehicle: vehicleId, status: SESSION_STATUSES.OPEN });
}

// Broader than getOpenSessionForVehicle: also includes CLOSING_PENDING. Used for read-only
// "what's my current session" views, where a driver should still see the session (and why
// it's frozen) rather than getting a bare "not found" once a closing has been submitted.
async function getActiveSessionForVehicle(vehicleId) {
  return InventorySession.findOne({ vehicle: vehicleId, status: { $in: ACTIVE_SESSION_STATUSES } });
}

// Resolves the driver's own open session server-side. Never trust a session/vehicle/shift id
// coming from the client for actions a driver performs on their own session. Requires, in
// order: an active assigned vehicle, an OPEN WorkShift, and an OPEN InventorySession that
// belongs to that same shift (a session opened under an earlier, now-ended shift doesn't count).
async function getActiveSessionForDriver(driverId) {
  const vehicle = await vehiclesService.getActiveVehicleForDriver(driverId);
  if (!vehicle) {
    throw new HttpError(400, 'No tienes un vehículo activo asignado. Contacta a tu manager.');
  }

  const workShift = await workShiftsService.getOpenShiftForDriver(driverId);
  if (!workShift) {
    throw new HttpError(400, 'Debes iniciar tu turno antes de operar.');
  }

  const session = await getOpenSessionForVehicle(vehicle._id);
  if (!session) {
    throw new HttpError(400, 'No hay una sesión de inventario abierta para tu vehículo. Contacta a tu manager.');
  }

  if (String(session.workShift) !== String(workShift._id)) {
    throw new HttpError(400, 'La sesión de inventario no corresponde a tu turno activo. Contacta a tu manager.');
  }

  return session;
}

async function loadSessionOrFail(id) {
  const session = await InventorySession.findById(id);
  if (!session) {
    throw new HttpError(404, 'Sesión de inventario no encontrada');
  }
  return session;
}

async function getSessionById(id) {
  const session = await InventorySession.findById(id)
    .populate('vehicle', 'name')
    .populate('driver', 'name email')
    .populate('createdBy', 'name email')
    .populate('initialStock.product', 'name icon');

  if (!session) {
    throw new HttpError(404, 'Sesión de inventario no encontrada');
  }

  return session;
}

async function listSessions(filter = {}) {
  return InventorySession.find(filter)
    .sort({ createdAt: -1 })
    .populate('vehicle', 'name')
    .populate('driver', 'name email');
}

async function openSession({ vehicleId, businessDate, initialStock, createdBy }) {
  let vehicle;
  try {
    vehicle = await vehiclesService.getVehicleById(vehicleId);
  } catch (err) {
    throw new HttpError(400, 'Vehículo inválido');
  }
  if (!vehicle.active) {
    throw new HttpError(400, 'El vehículo no está activo');
  }
  if (!vehicle.assignedDriver) {
    throw new HttpError(400, 'El vehículo no tiene chofer asignado');
  }

  const workShift = await workShiftsService.getOpenShiftForDriver(vehicle.assignedDriver._id);
  if (!workShift) {
    throw new HttpError(400, 'El chofer no tiene un turno de trabajo abierto. Debe iniciar turno antes de abrir la sesión.');
  }

  const existingActive = await InventorySession.findOne({
    vehicle: vehicle._id,
    status: { $in: ACTIVE_SESSION_STATUSES },
  });
  if (existingActive) {
    throw new HttpError(400, 'Ya existe una sesión de inventario activa para este vehículo');
  }

  const normalizedStock = await normalizeStockInput(initialStock);

  let session;
  try {
    session = await InventorySession.create({
      vehicle: vehicle._id,
      driver: vehicle.assignedDriver._id,
      workShift: workShift._id,
      businessDate: businessDate ? new Date(businessDate) : new Date(),
      startedAt: new Date(),
      status: SESSION_STATUSES.OPEN,
      initialStock: normalizedStock,
      createdBy,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(400, 'Ya existe una sesión de inventario activa para este vehículo');
    }
    throw err;
  }

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: session._id,
    action: 'CREATE',
    changes: [{ field: 'initialStock', oldValue: null, newValue: normalizedStock }],
    performedBy: createdBy,
  });

  // Keep a queryable InventoryCount record (type INITIAL) alongside partial/closing counts.
  // Lazy-required to avoid a circular dependency (inventoryCounts.service depends on this module).
  const inventoryCountsService = require('../inventoryCounts/inventoryCounts.service');
  await inventoryCountsService.recordInitialCount(session, createdBy);

  return getSessionById(session._id);
}

async function updateInitialStock(sessionId, rawStock, managerId) {
  const session = await loadSessionOrFail(sessionId);

  if (session.status !== SESSION_STATUSES.OPEN) {
    throw new HttpError(400, 'Solo se puede modificar el stock inicial de una sesión abierta');
  }

  const oldStock = session.initialStock.map((s) => ({ product: s.product, quantity: s.quantity }));
  const newStock = await normalizeStockInput(rawStock);

  session.initialStock = newStock;
  await session.save();

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: session._id,
    action: 'UPDATE',
    changes: [{ field: 'initialStock', oldValue: oldStock, newValue: newStock }],
    performedBy: managerId,
  });

  return getSessionById(session._id);
}

// Called by closing.service right after the driver submits a Closing, so the session
// (and the financial/inventory state it represents) is frozen before anything else can
// touch it. Uses an atomic conditional update so two concurrent submissions can't both win.
async function transitionToClosingPending(sessionId) {
  return InventorySession.findOneAndUpdate(
    { _id: sessionId, status: SESSION_STATUSES.OPEN },
    { $set: { status: SESSION_STATUSES.CLOSING_PENDING } },
    { new: true }
  );
}

// Best-effort rollback if creating the Closing record fails right after the session was
// frozen — not audited, since it isn't a real state the system settled into.
async function revertToOpen(sessionId) {
  await InventorySession.updateOne(
    { _id: sessionId, status: SESSION_STATUSES.CLOSING_PENDING },
    { $set: { status: SESSION_STATUSES.OPEN } }
  );
}

// Administrative reopen: a manager sends a CLOSING_PENDING session back to OPEN so the
// driver's mistake can be corrected. Only valid from CLOSING_PENDING.
async function reopenSession(sessionId, managerId) {
  const updated = await InventorySession.findOneAndUpdate(
    { _id: sessionId, status: SESSION_STATUSES.CLOSING_PENDING },
    { $set: { status: SESSION_STATUSES.OPEN } },
    { new: true }
  );

  if (!updated) {
    throw new HttpError(400, 'La sesión no está en estado de cierre pendiente');
  }

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: updated._id,
    action: 'UPDATE',
    changes: [{ field: 'status', oldValue: SESSION_STATUSES.CLOSING_PENDING, newValue: SESSION_STATUSES.OPEN }],
    performedBy: managerId,
  });

  return updated;
}

async function closeSession(sessionId, managerId) {
  const session = await loadSessionOrFail(sessionId);

  if (session.status !== SESSION_STATUSES.CLOSING_PENDING) {
    throw new HttpError(400, `No se puede finalizar una sesión en estado ${session.status}`);
  }

  session.status = SESSION_STATUSES.CLOSED;
  session.endedAt = new Date();
  await session.save();

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: session._id,
    action: 'CLOSE',
    changes: [{ field: 'status', oldValue: SESSION_STATUSES.CLOSING_PENDING, newValue: SESSION_STATUSES.CLOSED }],
    performedBy: managerId,
  });

  return session;
}

async function computeExpectedInventory(sessionId) {
  const session = await loadSessionOrFail(sessionId);

  const expectedMap = new Map();
  for (const stock of session.initialStock) {
    expectedMap.set(String(stock.product), stock.quantity);
  }

  const sales = await Sale.find({
    inventorySession: session._id,
    status: { $in: INVENTORY_AFFECTING_SALE_STATUSES },
  }).select('items');

  for (const sale of sales) {
    for (const item of sale.items) {
      const key = String(item.product);
      const current = expectedMap.has(key) ? expectedMap.get(key) : 0;
      expectedMap.set(key, current - item.quantity);
    }
  }

  return Array.from(expectedMap.entries()).map(([product, quantityExpected]) => ({ product, quantityExpected }));
}

// The "latest reliable inventory state" for a vehicle, independent of any one session —
// used by weekly counts and replenishment, neither of which is tied to a single business day.
// Prefers a live active session (OPEN or CLOSING_PENDING); falls back to the most recently
// CLOSED session's final state; falls back to empty if the vehicle has never had a session.
async function getCurrentStockForVehicle(vehicleId) {
  let session = await InventorySession.findOne({
    vehicle: vehicleId,
    status: { $in: ACTIVE_SESSION_STATUSES },
  }).sort({ createdAt: -1 });
  let source = 'ACTIVE_SESSION';

  if (!session) {
    session = await InventorySession.findOne({ vehicle: vehicleId, status: SESSION_STATUSES.CLOSED }).sort({
      businessDate: -1,
      createdAt: -1,
    });
    source = session ? 'LAST_CLOSED_SESSION' : 'NONE';
  }

  if (!session) {
    return { source, session: null, stock: [] };
  }

  const stock = await computeExpectedInventory(session._id);
  return { source, session, stock };
}

// Same as computeExpectedInventory, but with product name/icon populated for display.
async function getExpectedInventoryWithProducts(sessionId) {
  const expected = await computeExpectedInventory(sessionId);
  const products = await Product.find({ _id: { $in: expected.map((e) => e.product) } }).select('name icon');
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  return expected.map((e) => ({
    product: productMap.get(String(e.product)) || e.product,
    quantityExpected: e.quantityExpected,
  }));
}

module.exports = {
  getOpenSessionForVehicle,
  getActiveSessionForVehicle,
  getActiveSessionForDriver,
  loadSessionOrFail,
  getSessionById,
  listSessions,
  openSession,
  updateInitialStock,
  getExpectedInventoryWithProducts,
  transitionToClosingPending,
  revertToOpen,
  reopenSession,
  closeSession,
  computeExpectedInventory,
  getCurrentStockForVehicle,
};
