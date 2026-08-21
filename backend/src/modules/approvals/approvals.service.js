const Sale = require('../sales/sale.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { SALE_STATUSES, SESSION_STATUSES } = require('../../shared/constants');
const { validatePaymentsShape } = require('../payments/payments.validation');
const { validatePaymentsMatchTotal } = require('../payments/payments.service');
const salesService = require('../sales/sales.service');
const inventoryService = require('../inventory/inventory.service');
const auditService = require('../audit/audit.service');

const EDITABLE_STATUSES = [SALE_STATUSES.PENDING, SALE_STATUSES.INCIDENT];

// Once a session leaves OPEN (closing submitted or fully finalized), the financial/inventory
// state it represents is frozen: no sale belonging to it can be modified until a manager
// administratively reopens the closing (session goes back to OPEN).
async function assertSessionEditable(sale) {
  const session = await inventoryService.loadSessionOrFail(sale.inventorySession);
  if (session.status !== SESSION_STATUSES.OPEN) {
    throw new HttpError(
      400,
      'No se pueden modificar ventas de una sesión con cierre pendiente o finalizada. Reabre el cierre primero si es necesario.'
    );
  }
}

async function listPending() {
  return Sale.find({ status: SALE_STATUSES.PENDING })
    .sort({ createdAt: 1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email')
    .populate('items.product', 'name icon basePrice');
}

async function loadSaleOrFail(id) {
  const sale = await Sale.findById(id);
  if (!sale) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  return sale;
}

function diffField(changes, field, oldValue, newValue) {
  if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
    changes.push({ field, oldValue, newValue });
  }
}

async function updateSale(id, updates, managerId) {
  const sale = await loadSaleOrFail(id);
  await assertSessionEditable(sale);

  if (!EDITABLE_STATUSES.includes(sale.status)) {
    throw new HttpError(400, `No se puede modificar una venta en estado ${sale.status}`);
  }

  const changes = [];

  let items = sale.items;
  if (updates.items) {
    items = await salesService.buildItemsFromRequest(updates.items);
    diffField(changes, 'items', sale.items.toObject(), items);
  }

  const subtotalOriginal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  diffField(changes, 'subtotalOriginal', sale.subtotalOriginal, subtotalOriginal);

  let adjustment = sale.adjustment.toObject();
  if (updates.adjustment) {
    adjustment = salesService.buildAdjustment(updates.adjustment);
    diffField(changes, 'adjustment', sale.adjustment.toObject(), adjustment);
  }

  const totalFinal = round2(subtotalOriginal + adjustment.amount);
  diffField(changes, 'totalFinal', sale.totalFinal, totalFinal);

  let payments = sale.payments;
  if (updates.payments) {
    validatePaymentsShape(updates.payments);
    payments = updates.payments;
    diffField(changes, 'payments', sale.payments.toObject(), payments);
  }

  if (!validatePaymentsMatchTotal(payments, totalFinal)) {
    throw new HttpError(400, 'La suma de los pagos debe ser igual al total de la venta');
  }

  if (changes.length === 0) {
    return salesService.getSaleById(id);
  }

  sale.items = items;
  sale.subtotalOriginal = subtotalOriginal;
  sale.adjustment = adjustment;
  sale.totalFinal = totalFinal;
  sale.payments = payments;
  await sale.save();

  await auditService.logChange({
    entity: 'Sale',
    entityId: sale._id,
    action: 'UPDATE',
    changes,
    performedBy: managerId,
  });

  return salesService.getSaleById(id);
}

async function approve(id, managerId) {
  const sale = await loadSaleOrFail(id);
  await assertSessionEditable(sale);

  if (!EDITABLE_STATUSES.includes(sale.status)) {
    throw new HttpError(400, `No se puede aprobar una venta en estado ${sale.status}`);
  }

  const oldStatus = sale.status;
  sale.status = SALE_STATUSES.APPROVED;
  sale.approval = { approvedBy: managerId, approvedAt: new Date() };
  await sale.save();

  await auditService.logChange({
    entity: 'Sale',
    entityId: sale._id,
    action: 'APPROVE',
    changes: [{ field: 'status', oldValue: oldStatus, newValue: SALE_STATUSES.APPROVED }],
    performedBy: managerId,
  });

  return salesService.getSaleById(id);
}

async function cancel(id, managerId, reason) {
  if (!reason || !reason.trim()) {
    throw new HttpError(400, 'El motivo de cancelación es obligatorio');
  }

  const sale = await loadSaleOrFail(id);
  await assertSessionEditable(sale);

  if (sale.status === SALE_STATUSES.CANCELLED || sale.status === SALE_STATUSES.APPROVED) {
    throw new HttpError(400, `No se puede cancelar una venta en estado ${sale.status}`);
  }

  const oldStatus = sale.status;
  sale.status = SALE_STATUSES.CANCELLED;
  sale.cancellation = { reason: reason.trim(), cancelledBy: managerId, cancelledAt: new Date() };
  await sale.save();

  await auditService.logChange({
    entity: 'Sale',
    entityId: sale._id,
    action: 'CANCEL',
    changes: [
      { field: 'status', oldValue: oldStatus, newValue: SALE_STATUSES.CANCELLED },
      { field: 'cancellation.reason', oldValue: null, newValue: sale.cancellation.reason },
    ],
    performedBy: managerId,
  });

  return salesService.getSaleById(id);
}

async function markIncident(id, managerId, note) {
  if (!note || !note.trim()) {
    throw new HttpError(400, 'La nota del incidente es obligatoria');
  }

  const sale = await loadSaleOrFail(id);
  await assertSessionEditable(sale);

  if (sale.status !== SALE_STATUSES.PENDING) {
    throw new HttpError(
      400,
      `Solo se puede marcar incidente sobre una venta PENDING (estado actual: ${sale.status})`
    );
  }

  sale.status = SALE_STATUSES.INCIDENT;
  sale.incident = { note: note.trim(), markedBy: managerId, markedAt: new Date() };
  await sale.save();

  await auditService.logChange({
    entity: 'Sale',
    entityId: sale._id,
    action: 'MARK_INCIDENT',
    changes: [
      { field: 'status', oldValue: SALE_STATUSES.PENDING, newValue: SALE_STATUSES.INCIDENT },
      { field: 'incident.note', oldValue: null, newValue: sale.incident.note },
    ],
    performedBy: managerId,
  });

  return salesService.getSaleById(id);
}

module.exports = { listPending, updateSale, approve, cancel, markIncident };
