const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateUpdateRuleBody } = require('./alerts.validation');
const controller = require('./alerts.controller');

const router = express.Router();

// Manager/Admin only — no driver-facing routes in this checkpoint at all, for either
// configuration or operational alerts.
const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/rules', ...managerOnly, controller.listRules);
router.patch('/rules/:key', ...managerOnly, validateUpdateRuleBody, controller.updateRule);

router.post('/evaluate', ...managerOnly, controller.evaluate);
router.get('/', ...managerOnly, controller.list);
router.get('/:id', ...managerOnly, controller.getById);
router.post('/:id/acknowledge', ...managerOnly, controller.acknowledge);

module.exports = router;
