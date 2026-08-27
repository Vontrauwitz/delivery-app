const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const salesService = require('./sales.service');

async function create(req, res, next) {
  try {
    const sale = await salesService.createSale({
      driverId: req.user.id,
      items: req.body.items,
      adjustment: req.body.adjustment,
      payments: req.body.payments,
    });
    res.status(201).json(sale);
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    const sales = await salesService.listSalesByDriver(req.user.id);
    res.json(sales);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const sale = await salesService.getSaleById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(sale.driver._id) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver esta venta'));
    }

    res.json(sale);
  } catch (err) {
    next(err);
  }
}

async function stats(req, res, next) {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
    const data = await salesService.getSalesStats(days);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listMine, getById, stats };
