const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCreatePromotion, validateUpdatePromotion } = require('./promotions.validation');
const controller = require('./promotions.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

// Readable by any authenticated role (drivers need active promotions to price the cart live).
router.get('/', auth, controller.list);
router.get('/:id', auth, controller.getById);

router.post('/', ...managerOnly, validateCreatePromotion, controller.create);
router.put('/:id', ...managerOnly, validateUpdatePromotion, controller.update);
router.patch('/:id/activate', ...managerOnly, controller.activate);
router.patch('/:id/deactivate', ...managerOnly, controller.deactivate);

module.exports = router;
