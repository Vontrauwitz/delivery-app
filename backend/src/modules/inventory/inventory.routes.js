const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateOpenSession } = require('./inventory.validation');
const controller = require('./inventory.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', ...managerOnly, validateOpenSession, controller.open);
router.get('/', ...managerOnly, controller.list);
router.get('/active/mine', auth, requireRole([ROLES.DRIVER]), controller.getMyActiveSession);
router.get('/:id', auth, controller.getById);
router.get('/:id/expected', auth, controller.getExpected);
router.patch('/:id/initial-stock', ...managerOnly, controller.updateInitialStock);

module.exports = router;
