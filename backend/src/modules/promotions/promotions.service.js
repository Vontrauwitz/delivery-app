const Promotion = require('./promotion.model');
const Product = require('../products/product.model');
const HttpError = require('../../shared/httpError');
const { PROMOTION_TYPES } = require('../../shared/constants');

// Keeps pricing unambiguous: at most one active promotion per product at a time, so
// calculateLineSubtotal never has to choose between competing rules.
async function assertNoActiveConflict(productId, excludeId) {
  const query = { product: productId, active: true };
  if (excludeId) query._id = { $ne: excludeId };
  const existing = await Promotion.findOne(query);
  if (existing) {
    throw new HttpError(400, 'Ya existe una promoción activa para este producto. Desactívala primero.');
  }
}

async function listPromotions(filter = {}) {
  const query = {};
  if (filter.product) query.product = filter.product;
  if (filter.active !== undefined) {
    query.active = filter.active === true || filter.active === 'true';
  }
  return Promotion.find(query)
    .sort({ createdAt: -1 })
    .populate('product', 'name icon basePrice active')
    .populate('createdBy', 'name email');
}

async function getPromotionById(id) {
  const promotion = await Promotion.findById(id)
    .populate('product', 'name icon basePrice active')
    .populate('createdBy', 'name email');
  if (!promotion) {
    throw new HttpError(404, 'Promoción no encontrada');
  }
  return promotion;
}

async function createPromotion({ product, quantity, bundlePrice }, managerId) {
  const productDoc = await Product.findById(product);
  if (!productDoc || !productDoc.active) {
    throw new HttpError(400, 'Producto no disponible');
  }

  await assertNoActiveConflict(product);

  const promotion = await Promotion.create({
    product,
    type: PROMOTION_TYPES.QUANTITY_FOR_PRICE,
    quantity: Math.trunc(Number(quantity)),
    bundlePrice: Number(bundlePrice),
    active: true,
    createdBy: managerId,
  });

  return getPromotionById(promotion._id);
}

// Only quantity/bundlePrice are editable — the product a promotion targets is fixed at
// creation, so editing never has to re-validate an active-conflict against a different product.
async function updatePromotion(id, { quantity, bundlePrice }) {
  const promotion = await Promotion.findById(id);
  if (!promotion) {
    throw new HttpError(404, 'Promoción no encontrada');
  }

  if (quantity !== undefined) promotion.quantity = Math.trunc(Number(quantity));
  if (bundlePrice !== undefined) promotion.bundlePrice = Number(bundlePrice);
  await promotion.save();

  return getPromotionById(id);
}

async function setActive(id, active) {
  const promotion = await Promotion.findById(id);
  if (!promotion) {
    throw new HttpError(404, 'Promoción no encontrada');
  }

  if (active) {
    await assertNoActiveConflict(promotion.product, promotion._id);
  }

  promotion.active = active;
  await promotion.save();

  return getPromotionById(id);
}

// Read-only lookup used by sales.service to price a line — never used to enforce anything, and
// never trusts a client-supplied promotion; the sale always re-resolves it from the DB.
async function getActivePromotionForProduct(productId) {
  return Promotion.findOne({ product: productId, active: true });
}

module.exports = {
  listPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  setActive,
  getActivePromotionForProduct,
};
