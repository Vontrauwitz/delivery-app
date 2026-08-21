const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreateVehicle } = require('./vehicles.validation');
const controller = require('./vehicles.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/', ...managerOnly, controller.list);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.getMine);
router.get('/:id', ...managerOnly, controller.getById);
router.post('/', ...managerOnly, validateCreateVehicle, controller.create);
router.put('/:id', ...managerOnly, controller.update);

module.exports = router;
