const Vehicle = require('./vehicle.model');
const HttpError = require('../../shared/httpError');

async function getActiveVehicleForDriver(driverId) {
  return Vehicle.findOne({ assignedDriver: driverId, active: true });
}

async function listVehicles(filter = {}) {
  return Vehicle.find(filter).sort({ createdAt: -1 }).populate('assignedDriver', 'name email');
}

async function getVehicleById(id) {
  const vehicle = await Vehicle.findById(id).populate('assignedDriver', 'name email');
  if (!vehicle) {
    throw new HttpError(404, 'Vehículo no encontrado');
  }
  return vehicle;
}

async function createVehicle({ name, assignedDriver, active }) {
  if (!name || typeof name !== 'string') {
    throw new HttpError(400, 'El nombre del vehículo es requerido');
  }
  return Vehicle.create({ name, assignedDriver: assignedDriver || null, active: active !== false });
}

async function updateVehicle(id, updates) {
  const vehicle = await Vehicle.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!vehicle) {
    throw new HttpError(404, 'Vehículo no encontrado');
  }
  return vehicle;
}

module.exports = {
  getActiveVehicleForDriver,
  listVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
};
