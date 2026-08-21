const Closing = require('./closing.model');
const Sale = require('../sales/sale.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { SALE_STATUSES, CLOSING_STATUSES } = require('../../shared/constants');
const inventoryService = require('../inventory/inventory.service');
const inventoryCountsService = require('../inventoryCounts/inventoryCounts.service');
const auditService = require('../audit/audit.service');

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

async function createClosing({ driverId, counts, reportedCash }) {
  const session = await inventoryService.getActiveSessionForDriver(driverId);

  const existing = await Closing.findOne({ inventorySession: session._id });
  if (existing) {
    throw new HttpError(400, 'Ya existe un cierre registrado para esta sesión');
  }

  const reported = Number(reportedCash);
  if (!Number.isFinite(reported) || reported < 0) {
    throw new HttpError(400, 'El efectivo reportado debe ser un número válido (>= 0)');
  }

  // Creates the InventoryCount(type CLOSING) snapshot for this session's final physical count.
  const inventoryCount = await inventoryCountsService.createClosingCount(session._id, driverId, counts, driverId);
  const expectedCash = await computeExpectedCash(session._id);
  const cashDifference = round2(reported - expectedCash);

  const closing = await Closing.create({
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

  await auditService.logChange({
    entity: 'Closing',
    entityId: closing._id,
    action: 'CREATE',
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

  if (closing.status === CLOSING_STATUSES.CLOSED) {
    throw new HttpError(400, 'El cierre ya fue finalizado');
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
    action: 'CLOSE',
    changes,
    performedBy: managerId,
  });

  await inventoryService.closeSession(closing.inventorySession, managerId);

  return getClosingById(closing._id);
}

async function getClosingById(id) {
  const closing = await Closing.findById(id)
    .populate('vehicle', 'name')
    .populate('driver', 'name email')
    .populate('closedBy', 'name email')
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
    .populate('closedBy', 'name email');
}

module.exports = { createClosing, finalizeClosing, getClosingById, listClosings, computeExpectedCash };
