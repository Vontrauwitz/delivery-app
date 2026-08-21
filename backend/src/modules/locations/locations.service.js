const LocationPing = require('./location.model');
const User = require('../users/user.model');
const Vehicle = require('../vehicles/vehicle.model');
const HttpError = require('../../shared/httpError');
const { ROLES, LOCATION_STALE_THRESHOLD_MS } = require('../../shared/constants');

function isValidCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

// Driver identity always comes from the JWT (driverId), never from the request body.
async function recordLocation(driverId, { latitude, longitude, accuracy, clientTimestamp }) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!isValidCoordinate(lat, lng)) {
    throw new HttpError(400, 'latitude/longitude inválidos');
  }

  let acc;
  if (accuracy !== undefined && accuracy !== null) {
    acc = Number(accuracy);
    if (!Number.isFinite(acc) || acc < 0) {
      throw new HttpError(400, 'accuracy debe ser un número >= 0');
    }
  }

  return LocationPing.create({
    driver: driverId,
    latitude: lat,
    longitude: lng,
    accuracy: acc,
    clientTimestamp: clientTimestamp ? new Date(clientTimestamp) : undefined,
    serverTimestamp: new Date(),
  });
}

function withFreshness(ping) {
  if (!ping) return null;
  const obj = ping.toObject ? ping.toObject() : ping;
  const ageMs = Date.now() - new Date(obj.serverTimestamp).getTime();
  obj.isStale = ageMs > LOCATION_STALE_THRESHOLD_MS;
  return obj;
}

async function getLatestLocationForDriver(driverId) {
  const ping = await LocationPing.findOne({ driver: driverId }).sort({ serverTimestamp: -1 });
  return withFreshness(ping);
}

// Manager/Admin view: every active driver, with their latest ping (if any), current vehicle
// assignment, and freshness — computed fresh on every call, never stored.
async function getLatestLocationsForAllDrivers() {
  const drivers = await User.find({ role: ROLES.DRIVER, active: true }).select('name email').sort({ name: 1 });
  const driverIds = drivers.map((d) => d._id);

  const [vehicles, latestPings] = await Promise.all([
    Vehicle.find({ assignedDriver: { $in: driverIds } }).select('name assignedDriver'),
    LocationPing.aggregate([
      { $match: { driver: { $in: driverIds } } },
      { $sort: { serverTimestamp: -1 } },
      { $group: { _id: '$driver', ping: { $first: '$$ROOT' } } },
    ]),
  ]);

  const vehicleByDriver = new Map(vehicles.map((v) => [String(v.assignedDriver), v]));
  const pingByDriver = new Map(latestPings.map((p) => [String(p._id), p.ping]));

  return drivers.map((driver) => {
    const vehicle = vehicleByDriver.get(String(driver._id));
    const ping = pingByDriver.get(String(driver._id));
    const ageMs = ping ? Date.now() - new Date(ping.serverTimestamp).getTime() : null;

    return {
      driver: { _id: driver._id, name: driver.name, email: driver.email },
      vehicle: vehicle ? { _id: vehicle._id, name: vehicle.name } : null,
      location: ping
        ? {
            latitude: ping.latitude,
            longitude: ping.longitude,
            accuracy: ping.accuracy,
            serverTimestamp: ping.serverTimestamp,
            clientTimestamp: ping.clientTimestamp,
          }
        : null,
      isStale: ageMs === null ? null : ageMs > LOCATION_STALE_THRESHOLD_MS,
    };
  });
}

module.exports = {
  recordLocation,
  getLatestLocationForDriver,
  getLatestLocationsForAllDrivers,
};
