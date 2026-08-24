const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateOpenSession, validateReplenish } = require('./inventory.validation');
const controller = require('./inventory.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', ...managerOnly, validateOpenSession, controller.open);
router.get('/', ...managerOnly, controller.list);
router.get('/active/mine', auth, requireRole([ROLES.DRIVER]), controller.getMyActiveSession);
// Current-stock and replenish routes must be registered before the generic /:id route below,
// otherwise Express would try to treat "current"/"replenish" as a session id.
router.get('/current/mine', auth, requireRole([ROLES.DRIVER]), controller.getMyCurrentStock);
router.get('/current', ...managerOnly, controller.getCurrentStockForDriver);
router.post('/replenish', ...managerOnly, validateReplenish, controller.replenish);
router.get('/:id', auth, controller.getById);
router.get('/:id/expected', auth, controller.getExpected);
router.patch('/:id/initial-stock', ...managerOnly, controller.updateInitialStock);

module.exports = router;
