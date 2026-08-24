const service = require('./scheduledShifts.service');

async function create(req, res, next) {
  try {
    const scheduled = await service.createScheduledShift(req.body, req.user.id);
    res.status(201).json(scheduled);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const scheduled = await service.updateScheduledShift(req.params.id, req.body);
    res.json(scheduled);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await service.deleteScheduledShift(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const scheduled = await service.listScheduledShifts({ driver: req.query.driver });
    res.json(scheduled);
  } catch (err) {
    next(err);
  }
}

async function comparisons(req, res, next) {
  try {
    const result = await service.listComparisons({ driver: req.query.driver });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { create, update, remove, list, comparisons };
