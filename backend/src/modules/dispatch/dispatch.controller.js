const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./dispatch.service');

async function create(req, res, next) {
  try {
    const dispatch = await service.createDispatch({
      driverId: req.body.driver || undefined,
      vehicleId: req.body.vehicle,
      destinationLabel: req.body.destinationLabel,
      address: req.body.address,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      note: req.body.note,
      createdBy: req.user.id,
    });
    res.status(201).json(dispatch);
  } catch (err) {
    next(err);
  }
}

async function createBatch(req, res, next) {
  try {
    const result = await service.createBatch({ destinations: req.body.destinations, createdBy: req.user.id });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listMine(req, res, next) {
  try {
    res.json(await service.listForDriver(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function listAll(req, res, next) {
  try {
    const filter = {};
    if (req.query.driver) filter.driver = req.query.driver;
    if (req.query.status) filter.status = req.query.status;
    res.json(await service.listAll(filter));
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const dispatch = await service.getDispatchById(req.params.id);

    if (req.user.role === ROLES.DRIVER && String(dispatch.driver?._id || dispatch.driver) !== req.user.id) {
      return next(new HttpError(403, 'No tienes permiso para ver este dispatch'));
    }

    res.json(dispatch);
  } catch (err) {
    next(err);
  }
}

async function accept(req, res, next) {
  try {
    res.json(await service.acceptDispatch(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    res.json(await service.completeDispatch(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    res.json(await service.cancelDispatch(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function assign(req, res, next) {
  try {
    res.json(await service.assignDispatch(req.params.id, req.body.driver, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function batchAssign(req, res, next) {
  try {
    res.json(await service.batchAssign(req.body.ids, req.body.driver, req.user.id));
  } catch (err) {
    next(err);
  }
}

async function updateDestination(req, res, next) {
  try {
    const { address, destinationLabel, latitude, longitude } = req.body;
    res.json(await service.updateDestination(req.params.id, { address, destinationLabel, latitude, longitude }, req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { create, createBatch, listMine, listAll, getById, accept, complete, cancel, assign, batchAssign, updateDestination };
