const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateReason } = require('./workShifts.validation');
const controller = require('./workShifts.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/start', auth, requireRole([ROLES.DRIVER]), controller.start);
router.patch('/end', auth, requireRole([ROLES.DRIVER]), controller.end);
router.get('/active/mine', auth, requireRole([ROLES.DRIVER]), controller.getMyActive);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.listMine);
router.get('/', ...managerOnly, controller.list);
router.get('/:id', auth, controller.getById);
router.patch('/:id/admin-edit', ...managerOnly, validateReason, controller.adminEdit);
router.patch('/:id/admin-close', ...managerOnly, validateReason, controller.adminClose);

module.exports = router;
