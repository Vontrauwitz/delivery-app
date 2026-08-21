const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCounts } = require('./inventoryCounts.validation');
const controller = require('./inventoryCounts.controller');

const router = express.Router();

router.post('/partial', auth, requireRole([ROLES.DRIVER]), validateCounts, controller.createPartial);
router.get('/', auth, controller.listBySession);
router.get('/:id', auth, controller.getById);

module.exports = router;
