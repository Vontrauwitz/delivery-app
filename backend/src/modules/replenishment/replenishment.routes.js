const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateConfigBody } = require('./replenishment.validation');
const controller = require('./replenishment.controller');

const router = express.Router();

// Manager/Admin only — drivers have no replenishment configuration or viewing permissions.
const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/', ...managerOnly, controller.getSuggestions);
router.get('/config', ...managerOnly, controller.listConfig);
router.put('/config/:productId', ...managerOnly, validateConfigBody, controller.setConfig);
router.delete('/config/:productId', ...managerOnly, controller.resetConfig);

module.exports = router;
