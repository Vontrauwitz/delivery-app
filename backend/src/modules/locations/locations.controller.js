const service = require('./locations.service');

async function record(req, res, next) {
  try {
    const ping = await service.recordLocation(req.user.id, {
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      accuracy: req.body.accuracy,
      clientTimestamp: req.body.clientTimestamp,
    });
    res.status(201).json(ping);
  } catch (err) {
    next(err);
  }
}

async function getMine(req, res, next) {
  try {
    const ping = await service.getLatestLocationForDriver(req.user.id);
    res.json(ping);
  } catch (err) {
    next(err);
  }
}

async function getCurrent(req, res, next) {
  try {
    const locations = await service.getLatestLocationsForAllDrivers();
    res.json(locations);
  } catch (err) {
    next(err);
  }
}

module.exports = { record, getMine, getCurrent };
