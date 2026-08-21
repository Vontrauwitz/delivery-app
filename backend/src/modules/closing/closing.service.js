const Closing = require('./closing.model');
const Sale = require('../sales/sale.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { SALE_STATUSES, CLOSING_STATUSES, SESSION_STATUSES } = require('../../shared/constants');
const inventoryService = require('../inventory/inventory.service');
const inventoryCountsService = require('../inventoryCounts/inventoryCounts.service');
const auditService = require('../audit/audit.service');

// Closing statuses that count as "already handled" for this session — a new closing can't
// be submitted while one of these exists. REOPENED is deliberately excluded: it's a frozen
// historical record, not an active one, so a fresh submission is allowed after a reopen.
const ACTIVE_CLOSING_STATUSES = [CLOSING_STATUSES.OPEN, CLOSING_STATUSES.CLOSED];

async function computeExpectedCash(sessionId) {
  const sales = await Sale.find({ inventorySession: sessionId, status: SALE_STATUSES.APPROVED }).select('payments');

  let total = 0;
  for (const sale of sales) {
    for (const payment of sale.payments) {
      if (payment.method === 'cash') {
        total += payment.amount;
      }
    }
  }

  return round2(total);
}

function expectedInventoryMatches(frozen, current) {
  const frozenMap = new Map(frozen.map((e) => [String(e.product), e.quantityExpected]));
  const currentMap = new Map(current.map((e) => [String(e.product), e.quantityExpected]));
  const allKeys = new Set([...frozenMap.keys(), ...currentMap.keys()]);

  for (const key of allKeys) {
    const frozenValue = frozenMap.has(key) ? frozenMap.get(key) : 0;
    const currentValue = currentMap.has(key) ? currentMap.get(key) : 0;
    if (frozenValue !== currentValue) {
      return false;
    }
  }

  return true;
}

async function createClosing({ driverId, counts, reportedCash }) {
  // Validates active vehicle + OPEN WorkShift + OPEN InventorySession matching that shift.
  const session = await inventoryService.getActiveSessionForDriver(driverId);

  const existingActive = await Closing.findOne({
    inventorySession: session._id,
    status: { $in: ACTIVE_CLOSING_STATUSES },
  });
  if (existingActive) {
    throw new HttpError(400, 'Ya existe un cierre registrado para esta sesión');
  }

  const reported = Number(reportedCash);
  if (!Number.isFinite(reported) || reported < 0) {
    throw new HttpError(400, 'El efectivo reportado debe ser un número válido (>= 0)');
  }

  // Snapshot the closing count while the session is still OPEN (last operational read),
  // then immediately freeze the session so nothing else can change the numbers underneath it.
  const inventoryCount = await inventoryCountsService.recordClosingSnapshot(session, counts, driverId);

  const transitioned = await inventoryService.transitionToClosingPending(session._id);
  if (!transitioned) {
    // Extremely rare race (e.g. two submissions at once) — the count snapshot above is kept
    // (counts are never deleted), but no Closing is created against it.
    throw new HttpError(400, 'La sesión ya no está abierta. Puede que ya exista un cierre en curso.');
  }

  const expectedCash = await computeExpectedCash(session._id);
  const cashDifference = round2(reported - expectedCash);

  let closing;
  try {
    closing = await Closing.create({
      vehicle: session.vehicle,
      driver: session.driver,
      inventorySession: session._id,
      inventoryCount: inventoryCount._id,
      date: session.businessDate,
      expectedCash,
      reportedCash: round2(reported),
      cashDifference,
      status: CLOSING_STATUSES.OPEN,
    });
  } catch (err) {
    await inventoryService.revertToOpen(session._id);
    throw err;
  }

  await auditService.logChange({
    entity: 'InventorySession',
    entityId: session._id,
    action: 'UPDATE',
    changes: [{ field: 'status', oldValue: SESSION_STATUSES.OPEN, newValue: SESSION_STATUSES.CLOSING_PENDING }],
    performedBy: driverId,
  });

  await auditService.logChange({
    entity: 'Closing',
    entityId: closing._id,
    action: 'CLOSING_SUBMITTED',
    changes: [
      { field: 'expectedCash', oldValue: null, newValue: expectedCash },
      { field: 'reportedCash', oldValue: null, newValue: closing.reportedCash },
      { field: 'cashDifference', oldValue: null, newValue: cashDifference },
    ],
    performedBy: driverId,
  });

  return getClosingById(closing._id);
}

async function loadClosingOrFail(id) {
  const closing = await Closing.findById(id);
  if (!closing) {
    throw new HttpError(404, 'Cierre no encontrado');
  }
  return closing;
}

async function finalizeClosing(id, managerId, note) {
  const closing = await loadClosingOrFail(id);

  if (closing.status !== CLOSING_STATUSES.OPEN) {
    throw new HttpError(400, `No se puede finalizar un cierre en estado ${closing.status}`);
  }

  // Recompute from current data and compare against what was frozen at submission time.
  // Sale mutations are blocked while CLOSING_PENDING, so this should always match — but if
  // it doesn't (bug, manual DB edit, etc.), refuse to finalize silently on stale numbers.
  const freshExpectedCash = await computeExpectedCash(closing.inventorySession);
  if (freshExpectedCash !== closing.expectedCash) {
    throw new HttpError(
      409,
      `El efectivo esperado cambió desde que se envió el cierre (registrado: ${closing.expectedCash}, actual: ${freshExpectedCash}). Reabre el cierre para corregirlo antes de finalizar.`
    );
  }

  const frozenCount = await inventoryCountsService.getCountById(closing.inventoryCount);
  const frozenExpected = frozenCount.expectedAtCountTime.map((e) => ({
    product: e.product?._id || e.product,
    quantityExpected: e.quantityExpected,
  }));
  const freshExpected = await inventoryService.computeExpectedInventory(closing.inventorySession);
  if (!expectedInventoryMatches(frozenExpected, freshExpected)) {
    throw new HttpError(
      409,
      'El inventario esperado cambió desde que se envió el cierre. Reabre el cierre para corregirlo antes de finalizar.'
    );
  }

  const changes = [{ field: 'status', oldValue: CLOSING_STATUSES.OPEN, newValue: CLOSING_STATUSES.CLOSED }];

  const trimmedNote = (note || '').trim();
  if (trimmedNote && trimmedNote !== closing.managerNote) {
    changes.push({ field: 'managerNote', oldValue: closing.managerNote, newValue: trimmedNote });
    closing.managerNote = trimmedNote;
  }

  closing.status = CLOSING_STATUSES.CLOSED;
  closing.closedBy = managerId;
  closing.closedAt = new Date();
  await closing.save();

  await auditService.logChange({
    entity: 'Closing',
    entityId: closing._id,
    action: 'CLOSING_FINALIZED',
    changes,
    performedBy: managerId,
  });

  await inventoryService.closeSession(closing.inventorySession, managerId);

  return getClosingById(closing._id);
}

async function reopenClosing(id, managerId, reason) {
  if (!reason || !reason.trim()) {
    throw new HttpError(400, 'El motivo de la reapertura es obligatorio');
  }

  const closing = await loadClosingOrFail(id);
  if (closing.status !== CLOSING_STATUSES.OPEN) {
    throw new HttpError(400, `No se puede reabrir un cierre en estado ${closing.status}`);
  }

  // Session must go back OPEN before we mark the closing REOPENED, so a failure here leaves
  // the closing untouched rather than orphaning a REOPENED closing on a still-frozen session.
  await inventoryService.reopenSession(closing.inventorySession, managerId);

  closing.status = CLOSING_STATUSES.REOPENED;
  closing.reopenedBy = managerId;
  closing.reopenedAt = new Date();
  closing.reopenReason = reason.trim();
  await closing.save();

  await auditService.logChange({
    entity: 'Closing',
    entityId: closing._id,
    action: 'CLOSING_REOPENED',
    changes: [
      { field: 'status', oldValue: CLOSING_STATUSES.OPEN, newValue: CLOSING_STATUSES.REOPENED },
      { field: 'reopenReason', oldValue: null, newValue: closing.reopenReason },
    ],
    performedBy: managerId,
  });

  return getClosingById(closing._id);
}

async function getClosingById(id) {
  const closing = await Closing.findById(id)
    .populate('vehicle', 'name')
    .populate('driver', 'name email')
    .populate('closedBy', 'name email')
    .populate('reopenedBy', 'name email')
    .populate('inventoryCount');

  if (!closing) {
    throw new HttpError(404, 'Cierre no encontrado');
  }

  return closing;
}

async function listClosings(filter = {}) {
  return Closing.find(filter)
    .sort({ createdAt: -1 })
    .populate('vehicle', 'name')
    .populate('driver', 'name email')
    .populate('closedBy', 'name email')
    .populate('reopenedBy', 'name email');
}

module.exports = {
  createClosing,
  finalizeClosing,
  reopenClosing,
  getClosingById,
  listClosings,
  computeExpectedCash,
};
