const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const controller = require('./accountingPeriods.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/current', ...managerOnly, controller.getCurrent);
router.get('/', ...managerOnly, controller.list);
router.patch('/close', ...managerOnly, controller.close);

module.exports = router;
