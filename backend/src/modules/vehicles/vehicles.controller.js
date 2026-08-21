const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./vehicles.service');

async function list(req, res, next) {
  try {
    const vehicles = await service.listVehicles();
    res.json(vehicles);
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const vehicle = await service.getActiveVehicleForDriver(req.user.id);
    if (!vehicle) {
      return next(new HttpError(404, 'No tienes un vehículo activo asignado'));
    }
    res.json(vehicle);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const vehicle = await service.getVehicleById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(vehicle.assignedDriver?._id || vehicle.assignedDriver) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver este vehículo'));
    }

    res.json(vehicle);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const vehicle = await service.createVehicle(req.body);
    res.status(201).json(vehicle);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const vehicle = await service.updateVehicle(req.params.id, req.body);
    res.json(vehicle);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getMine, getById, create, update };
