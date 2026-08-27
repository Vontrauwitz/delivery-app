const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreateSale } = require('./sales.validation');
const controller = require('./sales.controller');

const router = express.Router();

router.post('/', auth, requireRole([ROLES.DRIVER]), validateCreateSale, controller.create);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.listMine);
router.get('/stats', auth, requireRole([ROLES.MANAGER, ROLES.ADMIN]), controller.stats);
router.get('/:id', auth, controller.getById);

module.exports = router;
