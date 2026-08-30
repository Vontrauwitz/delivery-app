const service = require('./alerts.service');

async function listRules(req, res, next) {
  try {
    res.json(await service.listRules());
  } catch (err) {
    next(err);
  }
}

async function updateRule(req, res, next) {
  try {
    const { enabled, severity, config } = req.body;
    res.json(await service.updateRule(req.params.key, { enabled, severity, config }, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function evaluate(req, res, next) {
  try {
    res.json(await service.evaluate());
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { status, severity, ruleKey, driver, from, to } = req.query;
    res.json(await service.listAlerts({ status, severity, ruleKey, driver, from, to }));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    res.json(await service.getAlertById(req.params.id));
  } catch (err) {
    next(err);
  }
}

async function acknowledge(req, res, next) {
  try {
    res.json(await service.acknowledgeAlert(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { listRules, updateRule, evaluate, list, getById, acknowledge };
