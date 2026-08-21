const InventorySession = require('./inventorySession.model');
const Product = require('../products/product.model');
const Sale = require('../sales/sale.model');
const vehiclesService = require('../vehicles/vehicles.service');
const HttpError = require('../../shared/httpError');
const { SESSION_STATUSES, INVENTORY_AFFECTING_SALE_STATUSES } = require('../../shared/constants');
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

// Resolves the driver's own open session server-side. Never trust a session/vehicle id
// coming from the client for actions a driver performs on their own session.
async function getActiveSessionForDriver(driverId) {
  const vehicle = await vehiclesService.getActiveVehicleForDriver(driverId);
  if (!vehicle) {
    throw new HttpError(400, 'No tienes un vehículo activo asignado. Contacta a tu manager.');
  }

  const session = await getOpenSessionForVehicle(vehicle._id);
  if (!session) {
    throw new HttpError(400, 'No hay una sesión de inventario abierta para tu vehículo. Contacta a tu manager.');
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

  const existingOpen = await getOpenSessionForVehicle(vehicle._id);
  if (existingOpen) {
    throw new HttpError(400, 'Ya existe una sesión de inventario abierta para este vehículo');
  }

  const normalizedStock = await normalizeStockInput(initialStock);

  let session;
  try {
    session = await InventorySession.create({
      vehicle: vehicle._id,
      driver: vehicle.assignedDriver._id,
      businessDate: businessDate ? new Date(businessDate) : new Date(),
      startedAt: new Date(),
      status: SESSION_STATUSES.OPEN,
      initialStock: normalizedStock,
      createdBy,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(400, 'Ya existe una sesión de inventario abierta para este vehículo');
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

async function closeSession(sessionId, managerId) {
  const session = await loadSessionOrFail(sessionId);

  if (session.status === SESSION_STATUSES.CLOSED) {
    throw new HttpError(400, 'La sesión ya está cerrada');
  }

  session.status = SESSION_STATUSES.CLOSED;
  session.endedAt = new Date();
  await session.save();

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: session._id,
    action: 'CLOSE',
    changes: [{ field: 'status', oldValue: SESSION_STATUSES.OPEN, newValue: SESSION_STATUSES.CLOSED }],
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
  getActiveSessionForDriver,
  loadSessionOrFail,
  getSessionById,
  listSessions,
  openSession,
  updateInitialStock,
  getExpectedInventoryWithProducts,
  closeSession,
  computeExpectedInventory,
};
