const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreateDriver, validateUpdateDriver } = require('./users.validation');
const controller = require('./users.controller');

const router = express.Router();

const canManage = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/me', auth, controller.getMe);
router.get('/', auth, requireRole([ROLES.MANAGER, ROLES.ADMIN]), controller.list);
router.get('/:id', ...canManage, controller.getDriver);
router.post('/', ...canManage, validateCreateDriver, controller.createDriver);
router.put('/:id', ...canManage, validateUpdateDriver, controller.updateDriver);
router.delete('/:id', ...canManage, controller.deleteDriver);

module.exports = router;
