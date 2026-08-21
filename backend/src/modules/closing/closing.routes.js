const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const controller = require('./closing.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', auth, requireRole([ROLES.DRIVER]), controller.create);
router.get('/', ...managerOnly, controller.list);
router.get('/:id', auth, controller.getById);
router.patch('/:id/finalize', ...managerOnly, controller.finalize);

module.exports = router;
