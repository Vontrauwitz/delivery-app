const Product = require('./product.model');
const Sale = require('../sales/sale.model');
const InventoryCount = require('../inventoryCounts/inventoryCount.model');
const InventorySession = require('../inventory/inventorySession.model');
const Promotion = require('../promotions/promotion.model');
const ReplenishmentConfig = require('../replenishment/replenishmentConfig.model');
const HttpError = require('../../shared/httpError');
const auditService = require('../audit/audit.service');

const TRACKED_FIELDS = ['name', 'basePrice', 'icon', 'order', 'active'];

function snapshot(product) {
  const obj = {};
  for (const field of TRACKED_FIELDS) obj[field] = product[field];
  return obj;
}

async function listProducts(filter = {}) {
  return Product.find(filter).sort({ order: 1, createdAt: -1 });
}

async function getProductById(id) {
  return Product.findById(id);
}

async function createProduct(data, actorId) {
  const product = await Product.create(data);

  await auditService.logChange({
    entity: 'Product',
    entityId: product._id,
    action: 'CREATE',
    changes: [{ field: 'product', oldValue: null, newValue: snapshot(product) }],
    performedBy: actorId,
  });

  return product;
}

async function updateProduct(id, data, actorId) {
  const before = await Product.findById(id);
  if (!before) {
    return null;
  }

  const after = await Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });

  const changes = TRACKED_FIELDS.filter((field) => before[field] !== after[field]).map((field) => ({
    field,
    oldValue: before[field],
    newValue: after[field],
  }));

  if (changes.length > 0) {
    // A pure active-flag flip is how the manager UI deactivates/reactivates a product — worth
    // its own distinct action in the trail rather than reading as a generic edit.
    const onlyActiveChanged = changes.length === 1 && changes[0].field === 'active';
    const action = onlyActiveChanged ? (after.active ? 'ACTIVATE' : 'DEACTIVATE') : 'UPDATE';

    await auditService.logChange({
      entity: 'Product',
      entityId: after._id,
      action,
      changes,
      performedBy: actorId,
    });
  }

  return after;
}

// A product is only safe to hard-delete when nothing anywhere still points at it — any
// historical sale, inventory count/session snapshot, promotion, or replenishment config must
// survive a catalog cleanup untouched. Deactivating (active: false) is the everyday way to
// retire a product; hard delete is reserved for one that's genuinely never been used.
async function isProductReferenced(productId) {
  // Lazy-required to avoid a circular dependency (replenishmentRequests.service depends on this
  // module for product lookup/validation) — same pattern as inventory.service's lazy require of
  // inventoryCounts.service. Going through the service (not the ReplenishmentRequest model
  // directly) keeps this module's cross-module reference checks and the rest of the project on
  // the same "reach other modules only through their service.js" convention.
  const replenishmentRequestsService = require('../replenishmentRequests/replenishmentRequests.service');

  const [sale, count, session, promotion, replenishmentConfig, replenishmentRequest] = await Promise.all([
    Sale.exists({ 'items.product': productId }),
    InventoryCount.exists({ $or: [{ 'counts.product': productId }, { 'expectedAtCountTime.product': productId }] }),
    InventorySession.exists({ 'initialStock.product': productId }),
    Promotion.exists({ product: productId }),
    ReplenishmentConfig.exists({ product: productId }),
    replenishmentRequestsService.isProductReferenced(productId),
  ]);
  return Boolean(sale || count || session || promotion || replenishmentConfig || replenishmentRequest);
}

async function deleteProduct(id, actorId) {
  const product = await Product.findById(id);
  if (!product) {
    return null;
  }

  if (await isProductReferenced(id)) {
    await auditService.logChange({
      entity: 'Product',
      entityId: id,
      action: 'DELETE_BLOCKED',
      changes: [{ field: 'product', oldValue: snapshot(product), newValue: null }],
      performedBy: actorId,
    });
    throw new HttpError(
      400,
      'No se puede eliminar: el producto tiene historial (ventas, inventario, promociones o reposición). Desactívalo en su lugar.'
    );
  }

  const deleted = await Product.findByIdAndDelete(id);

  await auditService.logChange({
    entity: 'Product',
    entityId: id,
    action: 'DELETE',
    changes: [{ field: 'product', oldValue: snapshot(product), newValue: null }],
    performedBy: actorId,
  });

  return deleted;
}

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct, isProductReferenced };
