const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const vehiclesService = require('../vehicles/vehicles.service');
const service = require('./inventory.service');

function assertCanView(req, session) {
  if (req.user.role === ROLES.DRIVER && String(session.driver?._id || session.driver) !== req.user.id) {
    throw new HttpError(403, 'No tienes permiso para ver esta sesión');
  }
}

async function open(req, res, next) {
  try {
    const session = await service.openSession({
      vehicleId: req.body.vehicle,
      businessDate: req.body.businessDate,
      initialStock: req.body.initialStock,
      createdBy: req.user.id,
    });
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const filter = {};
    if (req.query.vehicle) filter.vehicle = req.query.vehicle;
    if (req.query.status) filter.status = req.query.status;
    const sessions = await service.listSessions(filter);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

async function getMyActiveSession(req, res, next) {
  try {
    const vehicle = await vehiclesService.getActiveVehicleForDriver(req.user.id);
    if (!vehicle) {
      return next(new HttpError(404, 'No tienes un vehículo activo asignado'));
    }

    const session = await service.getOpenSessionForVehicle(vehicle._id);
    if (!session) {
      return next(new HttpError(404, 'No hay una sesión de inventario abierta para tu vehículo'));
    }

    res.json(await service.getSessionById(session._id));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const session = await service.getSessionById(req.params.id);
    assertCanView(req, session);
    res.json(session);
  } catch (err) {
    next(err);
  }
}

async function getExpected(req, res, next) {
  try {
    const session = await service.getSessionById(req.params.id);
    assertCanView(req, session);
    const expected = await service.getExpectedInventoryWithProducts(req.params.id);
    res.json(expected);
  } catch (err) {
    next(err);
  }
}

async function updateInitialStock(req, res, next) {
  try {
    const session = await service.updateInitialStock(req.params.id, req.body.initialStock, req.user.id);
    res.json(session);
  } catch (err) {
    next(err);
  }
}

module.exports = { open, list, getMyActiveSession, getById, getExpected, updateInitialStock };
