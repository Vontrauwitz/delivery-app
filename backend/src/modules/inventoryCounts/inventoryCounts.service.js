const InventoryCount = require('./inventoryCount.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { INVENTORY_COUNT_TYPES, SESSION_STATUSES } = require('../../shared/constants');
const inventoryService = require('../inventory/inventory.service');
const auditService = require('../audit/audit.service');

function normalizeCounts(rawCounts) {
  if (!Array.isArray(rawCounts) || rawCounts.length === 0) {
    throw new HttpError(400, 'Debes indicar el conteo de al menos un producto');
  }

  const result = [];
  const seen = new Set();

  for (const entry of rawCounts) {
    const quantityCounted = Number(entry?.quantityCounted);
    if (!entry?.product || !Number.isFinite(quantityCounted) || quantityCounted < 0) {
      throw new HttpError(400, 'Cada conteo debe tener un producto y una cantidad válida (>= 0)');
    }

    const key = String(entry.product);
    if (seen.has(key)) {
      throw new HttpError(400, 'Hay un producto duplicado en el conteo');
    }
    seen.add(key);

    result.push({ product: entry.product, quantityCounted });
  }

  return result;
}

async function createCount({ sessionId, type, rawCounts, driverId, createdBy }) {
  const session = await inventoryService.loadSessionOrFail(sessionId);

  if (session.status !== SESSION_STATUSES.OPEN) {
    throw new HttpError(400, 'No se pueden registrar conteos en una sesión cerrada');
  }

  if (String(session.driver) !== String(driverId)) {
    throw new HttpError(403, 'No puedes registrar un conteo para otro chofer');
  }

  const counts = normalizeCounts(rawCounts);
  const expected = await inventoryService.computeExpectedInventory(sessionId);
  const expectedAtCountTime = expected.map((e) => ({ product: e.product, quantityExpected: e.quantityExpected }));

  const doc = await InventoryCount.create({
    vehicle: session.vehicle,
    driver: session.driver,
    inventorySession: session._id,
    type,
    counts,
    expectedAtCountTime,
    createdBy,
  });

  await auditService.logChange({
    entity: 'InventoryCount',
    entityId: doc._id,
    action: 'CREATE',
    changes: [{ field: 'type', oldValue: null, newValue: type }],
    performedBy: createdBy,
  });

  return getCountById(doc._id);
}

// Called by inventory.service right after a session is opened, so every session
// has a queryable InventoryCount(type INITIAL) alongside its PARTIAL/CLOSING counts.
async function recordInitialCount(session, createdBy) {
  const counts = session.initialStock.map((s) => ({ product: s.product, quantityCounted: s.quantity }));
  const expectedAtCountTime = session.initialStock.map((s) => ({ product: s.product, quantityExpected: s.quantity }));

  const doc = await InventoryCount.create({
    vehicle: session.vehicle,
    driver: session.driver,
    inventorySession: session._id,
    type: INVENTORY_COUNT_TYPES.INITIAL,
    counts,
    expectedAtCountTime,
    createdBy,
  });

  await auditService.logChange({
    entity: 'InventoryCount',
    entityId: doc._id,
    action: 'CREATE',
    changes: [{ field: 'type', oldValue: null, newValue: INVENTORY_COUNT_TYPES.INITIAL }],
    performedBy: createdBy,
  });

  return doc;
}

async function createPartialCount(driverId, rawCounts) {
  const session = await inventoryService.getActiveSessionForDriver(driverId);
  return createCount({
    sessionId: session._id,
    type: INVENTORY_COUNT_TYPES.PARTIAL,
    rawCounts,
    driverId,
    createdBy: driverId,
  });
}

// Called by closing.service while the session is still OPEN (the closing snapshot is taken
// first, then the session is atomically frozen to CLOSING_PENDING) — so this intentionally
// skips createCount's own OPEN-only guard, which is meant for the public /partial endpoint.
async function recordClosingSnapshot(session, rawCounts, createdBy) {
  const counts = normalizeCounts(rawCounts);
  const expected = await inventoryService.computeExpectedInventory(session._id);
  const expectedAtCountTime = expected.map((e) => ({ product: e.product, quantityExpected: e.quantityExpected }));

  const doc = await InventoryCount.create({
    vehicle: session.vehicle,
    driver: session.driver,
    inventorySession: session._id,
    type: INVENTORY_COUNT_TYPES.CLOSING,
    counts,
    expectedAtCountTime,
    createdBy,
  });

  await auditService.logChange({
    entity: 'InventoryCount',
    entityId: doc._id,
    action: 'CREATE',
    changes: [{ field: 'type', oldValue: null, newValue: INVENTORY_COUNT_TYPES.CLOSING }],
    performedBy: createdBy,
  });

  return doc;
}

function withDifferences(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const expectedMap = new Map(
    obj.expectedAtCountTime.map((e) => [String(e.product?._id || e.product), e.quantityExpected])
  );

  obj.differences = obj.counts.map((c) => {
    const productId = String(c.product?._id || c.product);
    const quantityExpected = expectedMap.has(productId) ? expectedMap.get(productId) : 0;
    return {
      product: c.product,
      quantityCounted: c.quantityCounted,
      quantityExpected,
      difference: round2(c.quantityCounted - quantityExpected),
    };
  });

  return obj;
}

async function getCountById(id) {
  const doc = await InventoryCount.findById(id)
    .populate('driver', 'name email')
    .populate('createdBy', 'name email')
    .populate('counts.product', 'name icon')
    .populate('expectedAtCountTime.product', 'name icon');

  if (!doc) {
    throw new HttpError(404, 'Conteo no encontrado');
  }

  return withDifferences(doc);
}

async function listCountsBySession(sessionId) {
  const docs = await InventoryCount.find({ inventorySession: sessionId })
    .sort({ createdAt: 1 })
    .populate('driver', 'name email')
    .populate('createdBy', 'name email')
    .populate('counts.product', 'name icon')
    .populate('expectedAtCountTime.product', 'name icon');

  return docs.map(withDifferences);
}

module.exports = {
  createPartialCount,
  recordClosingSnapshot,
  recordInitialCount,
  getCountById,
  listCountsBySession,
};
