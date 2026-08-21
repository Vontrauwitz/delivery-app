const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateProduct } = require('./products.validation');
const controller = require('./products.controller');

const router = express.Router();

const canManage = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.get('/', auth, controller.list);
router.get('/:id', auth, controller.getById);
router.post('/', ...canManage, validateProduct, controller.create);
router.put('/:id', ...canManage, validateProduct, controller.update);
router.delete('/:id', ...canManage, controller.remove);

module.exports = router;
