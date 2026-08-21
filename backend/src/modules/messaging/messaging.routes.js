const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateSendMessage } = require('./messaging.validation');
const controller = require('./messaging.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', ...managerOnly, validateSendMessage, controller.send);
router.get('/inbox', auth, requireRole([ROLES.DRIVER]), controller.inbox);
router.get('/', ...managerOnly, controller.listAll);
router.get('/:id', auth, controller.getById);
router.patch('/:id/read', auth, requireRole([ROLES.DRIVER]), controller.markRead);

module.exports = router;
