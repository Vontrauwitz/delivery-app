const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const {
  validateCreateDispatch,
  validateBatchCreate,
  validateAssign,
  validateBatchAssign,
  validateUpdateDestination,
  validateReorderRoute,
  validateRouteSummaryQuery,
} = require('./dispatch.validation');
const controller = require('./dispatch.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

// Static paths (/batch, /batch-assign, /mine, /route-order, /route-summary) must be registered
// before the generic /:id route below, or Express would try to match them as an :id instead.
router.post('/', ...managerOnly, validateCreateDispatch, controller.create);
router.post('/batch', ...managerOnly, validateBatchCreate, controller.createBatch);
router.post('/batch-assign', ...managerOnly, validateBatchAssign, controller.batchAssign);
router.patch('/route-order', ...managerOnly, validateReorderRoute, controller.reorderRoute);
router.get('/route-summary', ...managerOnly, validateRouteSummaryQuery, controller.routeSummary);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.listMine);
router.get('/', ...managerOnly, controller.listAll);
router.get('/:id', auth, controller.getById);
router.patch('/:id/accept', auth, requireRole([ROLES.DRIVER]), controller.accept);
router.patch('/:id/complete', auth, requireRole([ROLES.DRIVER]), controller.complete);
router.patch('/:id/cancel', ...managerOnly, controller.cancel);
router.patch('/:id/assign', ...managerOnly, validateAssign, controller.assign);
router.patch('/:id/destination', ...managerOnly, validateUpdateDestination, controller.updateDestination);

module.exports = router;
