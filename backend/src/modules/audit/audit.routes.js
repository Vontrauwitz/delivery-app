const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { list } = require('./audit.controller');

const router = express.Router();

router.get('/', auth, requireRole([ROLES.MANAGER, ROLES.ADMIN]), list);

module.exports = router;
