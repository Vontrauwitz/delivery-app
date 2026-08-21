const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateRecordLocation } = require('./locations.validation');
const controller = require('./locations.controller');

const router = express.Router();

router.post('/', auth, requireRole([ROLES.DRIVER]), validateRecordLocation, controller.record);
router.get('/mine', auth, requireRole([ROLES.DRIVER]), controller.getMine);
router.get('/current', auth, requireRole([ROLES.MANAGER, ROLES.ADMIN]), controller.getCurrent);

module.exports = router;
