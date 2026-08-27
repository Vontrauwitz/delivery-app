const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateDefaultShift, validateException, validateExceptionUpdate } = require('./driverSchedule.validation');
const controller = require('./driverSchedule.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

// Driver's own read-only live status — no default-shift/exception read endpoints are needed
// beyond this: a driver's recurring pattern is already visible via the existing GET /users/me
// (defaultShift is just a field on User), and exceptions are manager-only data.
router.get('/status/me', auth, requireRole([ROLES.DRIVER]), controller.myStatus);

router.put('/drivers/:driverId/default-shift', ...managerOnly, validateDefaultShift, controller.updateDefaultShift);

router.get('/exceptions', ...managerOnly, controller.listExceptions);
router.post('/exceptions', ...managerOnly, validateException, controller.createException);
router.put('/exceptions/:id', ...managerOnly, validateExceptionUpdate, controller.updateException);
router.delete('/exceptions/:id', ...managerOnly, controller.deleteException);

router.get('/resolved', ...managerOnly, controller.resolved);
router.get('/status', ...managerOnly, controller.status);
router.get('/alerts', ...managerOnly, controller.alerts);

module.exports = router;
