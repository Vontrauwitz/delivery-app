const service = require('./accountingPeriods.service');

async function getCurrent(req, res, next) {
  try {
    const period = await service.getCurrentOpenPeriod();
    res.json(period);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const periods = await service.listPeriods();
    res.json(periods);
  } catch (err) {
    next(err);
  }
}

async function close(req, res, next) {
  try {
    const result = await service.closeCurrentPeriod(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getCurrent, list, close };
