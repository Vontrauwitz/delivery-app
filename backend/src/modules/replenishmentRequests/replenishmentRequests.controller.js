const service = require('./replenishmentRequests.service');

async function create(req, res, next) {
  try {
    const ticket = await service.createRequest({
      requestedBy: req.user.id,
      driver: req.body.driver,
      vehicle: req.body.vehicle,
      items: req.body.items,
      note: req.body.note,
    });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, driver, vehicle, from, to } = req.query;
    res.json(await service.listRequests({ status, driver, vehicle, from, to }));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    res.json(await service.getRequestById(req.params.id));
  } catch (err) {
    next(err);
  }
}

// Controlled allowlist — only these four fields are ever read from the body, regardless of what
// else the client sends (status/requestedBy/timestamps are never settable through this route).
async function update(req, res, next) {
  try {
    const { driver, vehicle, items, note } = req.body;
    const updates = {};
    if (driver !== undefined) updates.driver = driver;
    if (vehicle !== undefined) updates.vehicle = vehicle;
    if (items !== undefined) updates.items = items;
    if (note !== undefined) updates.note = note;

    res.json(await service.updateDraft(req.params.id, updates, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function send(req, res, next) {
  try {
    res.json(await service.sendRequest(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function fulfill(req, res, next) {
  try {
    res.json(await service.fulfillRequest(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    res.json(await service.cancelRequest(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, update, send, fulfill, cancel };
