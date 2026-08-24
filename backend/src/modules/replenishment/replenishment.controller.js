const HttpError = require('../../shared/httpError');
const service = require('./replenishment.service');

async function getSuggestions(req, res, next) {
  try {
    if (!req.query.driver) {
      return next(new HttpError(400, 'El parámetro driver es requerido'));
    }
    const result = await service.getReplenishmentSuggestions(req.query.driver);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listConfig(req, res, next) {
  try {
    res.json(await service.listConfig());
  } catch (err) {
    next(err);
  }
}

async function setConfig(req, res, next) {
  try {
    const config = await service.setConfig(req.params.productId, req.body, req.user.id);
    res.json(config);
  } catch (err) {
    next(err);
  }
}

async function resetConfig(req, res, next) {
  try {
    await service.resetConfig(req.params.productId, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getSuggestions, listConfig, setConfig, resetConfig };
