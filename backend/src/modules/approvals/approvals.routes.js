const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const controller = require('./approvals.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/pending', ...managerOnly, controller.listPending);
router.put('/:id', ...managerOnly, controller.update);
router.patch('/:id/approve', ...managerOnly, controller.approve);
router.patch('/:id/cancel', ...managerOnly, controller.cancel);
router.patch('/:id/mark-incident', ...managerOnly, controller.markIncident);

module.exports = router;
