const Sale = require('./sale.model');
const Product = require('../products/product.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const { SALE_STATUSES } = require('../../shared/constants');
const { validatePaymentsShape } = require('../payments/payments.validation');
const { validatePaymentsMatchTotal } = require('../payments/payments.service');
const auditService = require('../audit/audit.service');

async function buildItemsFromRequest(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'La venta debe tener al menos un producto');
  }

  const items = [];
  for (const raw of rawItems) {
    const quantity = Number(raw.quantity);
    if (!raw.product || !Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, 'Cada item debe tener un producto y una cantidad válida');
    }

    const product = await Product.findById(raw.product);
    if (!product || !product.active) {
      throw new HttpError(400, `Producto no disponible: ${raw.product}`);
    }

    const unitPrice = product.basePrice;
    const subtotal = round2(unitPrice * quantity);
    items.push({ product: product._id, quantity, unitPrice, subtotal });
  }

  return items;
}

function buildAdjustment(rawAdjustment) {
  const amount = round2(Number(rawAdjustment?.amount) || 0);
  const reason = (rawAdjustment?.reason || '').trim();

  if (amount !== 0 && !reason) {
    throw new HttpError(400, 'El motivo del ajuste es obligatorio cuando el monto es distinto de cero');
  }

  return { amount, reason };
}

async function createSale({ driverId, items: rawItems, adjustment: rawAdjustment, payments }) {
  const items = await buildItemsFromRequest(rawItems);
  const subtotalOriginal = round2(items.reduce((sum, item) => sum + item.subtotal, 0));
  const adjustment = buildAdjustment(rawAdjustment);
  const totalFinal = round2(subtotalOriginal + adjustment.amount);

  validatePaymentsShape(payments);
  if (!validatePaymentsMatchTotal(payments, totalFinal)) {
    throw new HttpError(400, 'La suma de los pagos debe ser igual al total de la venta');
  }

  const sale = await Sale.create({
    driver: driverId,
    items,
    subtotalOriginal,
    adjustment,
    totalFinal,
    payments,
    status: SALE_STATUSES.PENDING,
    createdBy: driverId,
  });

  await auditService.logChange({
    entity: 'Sale',
    entityId: sale._id,
    action: 'CREATE',
    changes: [],
    performedBy: driverId,
  });

  return getSaleById(sale._id);
}

async function listSalesByDriver(driverId) {
  return Sale.find({ driver: driverId }).sort({ createdAt: -1 });
}

async function getSaleById(id) {
  const sale = await Sale.findById(id)
    .populate('driver', 'name email')
    .populate('createdBy', 'name email')
    .populate('items.product', 'name icon basePrice')
    .populate('approval.approvedBy', 'name email')
    .populate('cancellation.cancelledBy', 'name email')
    .populate('incident.markedBy', 'name email');

  if (!sale) {
    throw new HttpError(404, 'Venta no encontrada');
  }

  return sale;
}

module.exports = {
  createSale,
  listSalesByDriver,
  getSaleById,
  buildItemsFromRequest,
  buildAdjustment,
};
