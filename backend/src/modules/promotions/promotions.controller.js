const service = require('./promotions.service');

async function list(req, res, next) {
  try {
    const promotions = await service.listPromotions({
      product: req.query.product,
      active: req.query.active,
    });
    res.json(promotions);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const promotion = await service.getPromotionById(req.params.id);
    res.json(promotion);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const promotion = await service.createPromotion(req.body, req.user.id);
    res.status(201).json(promotion);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const promotion = await service.updatePromotion(req.params.id, req.body);
    res.json(promotion);
  } catch (err) {
    next(err);
  }
}

async function activate(req, res, next) {
  try {
    const promotion = await service.setActive(req.params.id, true);
    res.json(promotion);
  } catch (err) {
    next(err);
  }
}

async function deactivate(req, res, next) {
  try {
    const promotion = await service.setActive(req.params.id, false);
    res.json(promotion);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, activate, deactivate };
