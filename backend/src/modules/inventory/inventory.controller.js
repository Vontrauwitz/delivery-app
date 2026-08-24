const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');
const service = require('./inventory.service');

function assertCanView(req, session) {
  if (req.user.role === ROLES.DRIVER && String(session.driver?._id || session.driver) !== req.user.id) {
    throw new HttpError(403, 'No tienes permiso para ver esta sesión');
  }
}

async function open(req, res, next) {
  try {
    const session = await service.openSession({
      driverId: req.body.driver,
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
    if (req.query.driver) filter.driver = req.query.driver;
    if (req.query.status) filter.status = req.query.status;
    const sessions = await service.listSessions(filter);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
}

async function getMyActiveSession(req, res, next) {
  try {
    const session = await service.getActiveSessionForDriverAny(req.user.id);
    if (!session) {
      return next(new HttpError(404, 'No tienes una sesión de inventario activa'));
    }

    res.json(await service.getSessionById(session._id));
  } catch (err) {
    next(err);
  }
}

// The single read both the driver's own inventory screen and the manager's per-driver
// inventory screen use — same underlying service call, so the two can never disagree.
async function getMyCurrentStock(req, res, next) {
  try {
    res.json(await service.getCurrentStockForDriverWithProducts(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function getCurrentStockForDriver(req, res, next) {
  try {
    if (!req.query.driver) {
      return next(new HttpError(400, 'El parámetro driver es requerido'));
    }
    res.json(await service.getCurrentStockForDriverWithProducts(req.query.driver));
  } catch (err) {
    next(err);
  }
}

async function replenish(req, res, next) {
  try {
    if (!req.body.driver) {
      return next(new HttpError(400, 'El chofer es requerido'));
    }
    res.status(201).json(await service.replenishStock(req.body.driver, req.body.items, req.user.id));
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

module.exports = {
  open,
  list,
  getMyActiveSession,
  getMyCurrentStock,
  getCurrentStockForDriver,
  replenish,
  getById,
  getExpected,
  updateInitialStock,
};
