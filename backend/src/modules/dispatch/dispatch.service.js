const Dispatch = require('./dispatch.model');
const User = require('../users/user.model');
const HttpError = require('../../shared/httpError');
const { ROLES, DISPATCH_STATUSES } = require('../../shared/constants');
const vehiclesService = require('../vehicles/vehicles.service');

function withMapsUrl(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.mapsUrl =
    obj.latitude !== undefined && obj.latitude !== null && obj.longitude !== undefined && obj.longitude !== null
      ? `https://maps.google.com/?q=${obj.latitude},${obj.longitude}`
      : `https://maps.google.com/?q=${encodeURIComponent(obj.address)}`;
  return obj;
}

async function createDispatch({ driverId, vehicleId, destinationLabel, address, latitude, longitude, note, createdBy }) {
  const driver = await User.findOne({ _id: driverId, role: ROLES.DRIVER, active: true });
  if (!driver) {
    throw new HttpError(400, 'Chofer inválido o inactivo');
  }
  if (!destinationLabel || !destinationLabel.trim()) {
    throw new HttpError(400, 'La etiqueta del destino es requerida');
  }
  if (!address || !address.trim()) {
    throw new HttpError(400, 'La dirección es requerida');
  }

  // "vehicle if relevant" — use what the manager specified, or fall back to the driver's
  // current active vehicle as a convenience; leave empty if neither is available.
  let vehicle = null;
  if (vehicleId) {
    vehicle = await vehiclesService.getVehicleById(vehicleId);
  } else {
    vehicle = await vehiclesService.getActiveVehicleForDriver(driverId);
  }

  const dispatch = await Dispatch.create({
    driver: driverId,
    vehicle: vehicle ? vehicle._id : undefined,
    destinationLabel: destinationLabel.trim(),
    address: address.trim(),
    latitude: latitude !== undefined && latitude !== null ? Number(latitude) : undefined,
    longitude: longitude !== undefined && longitude !== null ? Number(longitude) : undefined,
    note: (note || '').trim(),
    status: DISPATCH_STATUSES.PENDING,
    createdBy,
  });

  return getDispatchById(dispatch._id);
}

async function loadDispatchOrFail(id) {
  const dispatch = await Dispatch.findById(id);
  if (!dispatch) {
    throw new HttpError(404, 'Dispatch no encontrado');
  }
  return dispatch;
}

async function acceptDispatch(id, driverId) {
  const dispatch = await loadDispatchOrFail(id);

  if (String(dispatch.driver) !== String(driverId)) {
    throw new HttpError(403, 'No puedes aceptar el dispatch de otro chofer');
  }
  if (dispatch.status !== DISPATCH_STATUSES.PENDING) {
    throw new HttpError(400, `No se puede aceptar un dispatch en estado ${dispatch.status}`);
  }

  dispatch.status = DISPATCH_STATUSES.ACCEPTED;
  dispatch.acceptedAt = new Date();
  await dispatch.save();

  return getDispatchById(id);
}

async function completeDispatch(id, driverId) {
  const dispatch = await loadDispatchOrFail(id);

  if (String(dispatch.driver) !== String(driverId)) {
    throw new HttpError(403, 'No puedes completar el dispatch de otro chofer');
  }
  if (dispatch.status !== DISPATCH_STATUSES.ACCEPTED) {
    throw new HttpError(400, `Solo se puede completar un dispatch ACCEPTED (estado actual: ${dispatch.status})`);
  }

  dispatch.status = DISPATCH_STATUSES.COMPLETED;
  dispatch.completedAt = new Date();
  await dispatch.save();

  return getDispatchById(id);
}

async function cancelDispatch(id, managerId) {
  const dispatch = await loadDispatchOrFail(id);

  if (![DISPATCH_STATUSES.PENDING, DISPATCH_STATUSES.ACCEPTED].includes(dispatch.status)) {
    throw new HttpError(400, `No se puede cancelar un dispatch en estado ${dispatch.status}`);
  }

  dispatch.status = DISPATCH_STATUSES.CANCELLED;
  dispatch.cancelledAt = new Date();
  dispatch.cancelledBy = managerId;
  await dispatch.save();

  return getDispatchById(id);
}

async function getDispatchById(id) {
  const dispatch = await Dispatch.findById(id)
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email')
    .populate('cancelledBy', 'name email');

  if (!dispatch) {
    throw new HttpError(404, 'Dispatch no encontrado');
  }

  return withMapsUrl(dispatch);
}

async function listForDriver(driverId) {
  const dispatches = await Dispatch.find({ driver: driverId })
    .sort({ createdAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email');

  return dispatches.map(withMapsUrl);
}

async function listAll(filter = {}) {
  const dispatches = await Dispatch.find(filter)
    .sort({ createdAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('createdBy', 'name email')
    .populate('cancelledBy', 'name email');

  return dispatches.map(withMapsUrl);
}

module.exports = {
  createDispatch,
  acceptDispatch,
  completeDispatch,
  cancelDispatch,
  getDispatchById,
  listForDriver,
  listAll,
};
