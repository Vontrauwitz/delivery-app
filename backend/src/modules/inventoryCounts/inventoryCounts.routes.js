const express = require('express');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requireRole');
const { ROLES } = require('../../shared/constants');
const { validateCounts } = require('./inventoryCounts.validation');
const controller = require('./inventoryCounts.controller');

const router = express.Router();

const managerOnly = [auth, requireRole([ROLES.MANAGER, ROLES.ADMIN])];

router.post('/partial', auth, requireRole([ROLES.DRIVER]), validateCounts, controller.createPartial);
// WEEKLY is manager/admin-only for this phase: it's a driver-level audit not tied to a single
// session/shift, so it doesn't fit the existing driver-authorization chain (which always
// resolves "my own active session"). Extending that chain to a session-less action would be a
// new permission shape, not a reuse of the existing one — see PLAN deviations in the Phase 3
// summary for the full rationale.
router.post('/weekly', ...managerOnly, validateCounts, controller.createWeekly);
router.get('/weekly', ...managerOnly, controller.listWeekly);
router.get('/', auth, controller.listBySession);
router.get('/:id', auth, controller.getById);

module.exports = router;
