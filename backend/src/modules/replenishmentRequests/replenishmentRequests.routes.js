const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreateBody } = require('./replenishmentRequests.validation');
const controller = require('./replenishmentRequests.controller');

const router = express.Router();

// Manager/Admin only — this is a manager-created ticket workflow, no driver-facing routes exist
// in this checkpoint (sharing happens from the manager's own device).
const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', ...managerOnly, validateCreateBody, controller.create);
router.get('/', ...managerOnly, controller.list);
router.get('/:id', ...managerOnly, controller.getById);
router.patch('/:id', ...managerOnly, controller.update);
router.post('/:id/send', ...managerOnly, controller.send);
router.post('/:id/fulfill', ...managerOnly, controller.fulfill);
router.post('/:id/cancel', ...managerOnly, controller.cancel);

module.exports = router;
