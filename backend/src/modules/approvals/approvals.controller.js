const approvalsService = require('./approvals.service');

async function listPending(req, res, next) {
  try {
    const sales = await approvalsService.listPending();
    res.json(sales);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const sale = await approvalsService.updateSale(req.params.id, req.body, req.user.id);
    res.json(sale);
  } catch (err) {
    next(err);
  }
}

async function approve(req, res, next) {
  try {
    const sale = await approvalsService.approve(req.params.id, req.user.id);
    res.json(sale);
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const sale = await approvalsService.cancel(req.params.id, req.user.id, req.body.reason);
    res.json(sale);
  } catch (err) {
    next(err);
  }
}

async function markIncident(req, res, next) {
  try {
    const sale = await approvalsService.markIncident(req.params.id, req.user.id, req.body.note);
    res.json(sale);
  } catch (err) {
    next(err);
  }
}

module.exports = { listPending, update, approve, cancel, markIncident };
