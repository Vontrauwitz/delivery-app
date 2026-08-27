const HttpError = require('../../shared/httpError');
const service = require('./users.service');

async function getMe(req, res, next) {
  try {
    const user = await service.findById(req.user.id);
    if (!user) return next(new HttpError(404, 'Usuario no encontrado'));
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const users = await service.listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getDriver(req, res, next) {
  try {
    const driver = await service.findDriverById(req.params.id);
    if (!driver) return next(new HttpError(404, 'Chofer no encontrado'));
    res.json(driver);
  } catch (err) {
    next(err);
  }
}

async function createDriver(req, res, next) {
  try {
    const driver = await service.createDriver(req.body, req.user.id);
    res.status(201).json(driver);
  } catch (err) {
    next(err);
  }
}

async function updateDriver(req, res, next) {
  try {
    const driver = await service.updateDriver(req.params.id, req.body, req.user.id);
    if (!driver) return next(new HttpError(404, 'Chofer no encontrado'));
    res.json(driver);
  } catch (err) {
    next(err);
  }
}

async function deleteDriver(req, res, next) {
  try {
    const driver = await service.deleteDriver(req.params.id, req.user.id, req.body?.reason);
    if (!driver) return next(new HttpError(404, 'Chofer no encontrado'));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, list, getDriver, createDriver, updateDriver, deleteDriver };
