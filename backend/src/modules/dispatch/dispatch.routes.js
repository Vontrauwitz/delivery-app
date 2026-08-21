const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreateDispatch } = require('./dispatch.validation');
const controller = require('./dispatch.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/', ...managerOnly, validateCreateDispatch, controller.create);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.listMine);
router.get('/', ...managerOnly, controller.listAll);
router.get('/:id', auth, controller.getById);
router.patch('/:id/accept', auth, requireRole([ROLES.DRIVER]), controller.accept);
router.patch('/:id/complete', auth, requireRole([ROLES.DRIVER]), controller.complete);
router.patch('/:id/cancel', ...managerOnly, controller.cancel);

module.exports = router;
