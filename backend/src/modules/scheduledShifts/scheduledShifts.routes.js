const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const controller = require('./scheduledShifts.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/comparisons', ...managerOnly, controller.comparisons);
router.get('/', ...managerOnly, controller.list);
router.post('/', ...managerOnly, controller.create);
router.put('/:id', ...managerOnly, controller.update);
router.delete('/:id', ...managerOnly, controller.remove);

module.exports = router;
