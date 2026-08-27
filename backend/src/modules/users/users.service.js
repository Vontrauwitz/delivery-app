const bcrypt = require('bcryptjs');
const User = require('./user.model');
const Sale = require('../sales/sale.model');
const WorkShift = require('../workShifts/workShift.model');
const ScheduledShift = require('../scheduledShifts/scheduledShift.model');
const DriverScheduleException = require('../driverSchedule/driverScheduleException.model');
const InventorySession = require('../inventory/inventorySession.model');
const InventoryCount = require('../inventoryCounts/inventoryCount.model');
const Dispatch = require('../dispatch/dispatch.model');
const LocationPing = require('../locations/location.model');
const Message = require('../messaging/message.model');
const AuditLog = require('../audit/auditLog.model');
const auditService = require('../audit/audit.service');
const HttpError = require('../../shared/httpError');
const { ROLES } = require('../../shared/constants');

async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase().trim() });
}

async function findById(id) {
  return User.findById(id).select('-passwordHash');
}

// Used by seed/dbReset/tests to provision fixed demo accounts directly — deliberately untouched
// by the driver-management additions below (no audit trail, no role restriction): those are
// infrastructure, not a manager action.
async function createUser({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({ name, email, passwordHash, role });
}

async function listUsers(filter = {}) {
  return User.find(filter).select('-passwordHash');
}

// --- Driver management (manager-only) --------------------------------------------------------
// Everything below scopes strictly to role === DRIVER, both to match "Driver management is
// manager-only" (managers/admins manage *drivers* here, not each other's manager/admin accounts)
// and as a structural guard against ever deactivating/deleting/editing the acting manager's own
// account through this driver-only surface.

const DRIVER_TRACKED_FIELDS = ['name', 'email', 'active'];

function driverSnapshot(user) {
  const obj = {};
  for (const field of DRIVER_TRACKED_FIELDS) obj[field] = user[field];
  return obj;
}

async function findDriverById(id) {
  const user = await User.findById(id).select('-passwordHash');
  if (!user || user.role !== ROLES.DRIVER) return null;
  return user;
}

async function createDriver({ name, email, password }, actorId) {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await findByEmail(normalizedEmail);
  if (existing) {
    throw new HttpError(400, 'Ya existe un usuario con ese email');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let driver;
  try {
    driver = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash, role: ROLES.DRIVER });
  } catch (err) {
    // Race: two duplicate taps/requests can both pass the findByEmail check above before either
    // insert lands — the schema's unique index is the real source of truth; this just turns its
    // raw duplicate-key error into the same clear message as the pre-check.
    if (err.code === 11000) {
      throw new HttpError(400, 'Ya existe un usuario con ese email');
    }
    throw err;
  }

  await auditService.logChange({
    entity: 'User',
    entityId: driver._id,
    action: 'DRIVER_CREATE',
    changes: [{ field: 'driver', oldValue: null, newValue: driverSnapshot(driver) }],
    performedBy: actorId,
  });

  return findDriverById(driver._id);
}

async function updateDriver(id, data, actorId) {
  const before = await User.findById(id);
  if (!before || before.role !== ROLES.DRIVER) return null;

  const update = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.email !== undefined) {
    const email = data.email.toLowerCase().trim();
    if (email !== before.email) {
      const existing = await findByEmail(email);
      if (existing && String(existing._id) !== String(before._id)) {
        throw new HttpError(400, 'Ya existe un usuario con ese email');
      }
    }
    update.email = email;
  }
  if (data.active !== undefined) update.active = Boolean(data.active);

  // A deliberate, separate field — omitted or '' means "leave the password unchanged", never an
  // accidental overwrite just because the edit form's other fields were resubmitted.
  const passwordChanged = Boolean(data.password);
  if (passwordChanged) {
    update.passwordHash = await bcrypt.hash(data.password, 10);
  }

  let after;
  try {
    after = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  } catch (err) {
    if (err.code === 11000) {
      throw new HttpError(400, 'Ya existe un usuario con ese email');
    }
    throw err;
  }

  const changes = DRIVER_TRACKED_FIELDS.filter((field) => String(before[field]) !== String(after[field])).map((field) => ({
    field,
    oldValue: before[field],
    newValue: after[field],
  }));
  // The hash itself — old or new — never appears in the trail, matching "never return
  // password/hash" for storage as well as API responses. Only the fact that it changed is worth
  // recording.
  if (passwordChanged) changes.push({ field: 'password', oldValue: null, newValue: 'changed' });

  if (changes.length > 0) {
    // A pure active-flag flip is how the manager activates/deactivates a driver — worth its own
    // distinct action in the trail (matching products.service's identical convention) rather
    // than reading as a generic edit.
    const onlyActiveChanged = changes.length === 1 && changes[0].field === 'active';
    const action = onlyActiveChanged ? (after.active ? 'DRIVER_ACTIVATE' : 'DRIVER_DEACTIVATE') : 'DRIVER_UPDATE';
    const reasonChange = data.reason ? [{ field: 'reason', oldValue: null, newValue: String(data.reason).trim() }] : [];

    await auditService.logChange({
      entity: 'User',
      entityId: after._id,
      action,
      changes: [...changes, ...reasonChange],
      performedBy: actorId,
    });
  }

  return findDriverById(after._id);
}

// A driver is only safe to hard-delete when nothing anywhere still points at them — same
// reasoning as products.service.isProductReferenced. Covers every collection that actually
// stores a reference to a driver's User doc today: sales, work shifts, scheduled shifts,
// schedule exceptions, inventory (current sessions and historical counts), Dispatch/
// LocationPing/Message (checked below purely for referential safety — this does NOT build or
// change any Delivery/Dispatch feature, it only stops a hard delete from orphaning their `driver`
// references), and the driver's own audit trail. Dispatch's `createdBy`/`cancelledBy` and
// Message's `sender` are never a driver (see dispatch.service/messaging.service — both are
// manager-only actions), so only each schema's actual driver-referencing field is checked.
//
// The audit check is scoped to `performedBy` only — actions this driver themselves performed
// (starting/ending a shift, recording a sale) — never `entityId` matches on their own User doc.
// Administrative entries about the driver's own profile (DRIVER_CREATE/DRIVER_UPDATE/
// DRIVER_ACTIVATE/DRIVER_DEACTIVATE, or UPDATE_DEFAULT_SHIFT from editing their recurring
// schedule) would otherwise make a driver permanently undeletable the moment they're created or
// edited even once — self-defeating, and not what "has operational history" means here.
async function getDriverReferences(driverId) {
  const [sale, workShift, scheduledShift, scheduleException, inventorySession, inventoryCount, dispatch, location, message, auditEntry] =
    await Promise.all([
      Sale.exists({ driver: driverId }),
      WorkShift.exists({ driver: driverId }),
      ScheduledShift.exists({ driver: driverId }),
      DriverScheduleException.exists({ driver: driverId }),
      InventorySession.exists({ driver: driverId }),
      InventoryCount.exists({ driver: driverId }),
      Dispatch.exists({ driver: driverId }),
      LocationPing.exists({ driver: driverId }),
      // Drivers are only ever recipients (see messaging.service.sendMessage's role check on
      // recipientIds), never a sender — no need to also check `sender`.
      Message.exists({ recipients: driverId }),
      AuditLog.exists({ performedBy: driverId }),
    ]);
  return {
    sales: Boolean(sale),
    workShifts: Boolean(workShift),
    scheduledShifts: Boolean(scheduledShift),
    scheduleExceptions: Boolean(scheduleException),
    inventory: Boolean(inventorySession || inventoryCount),
    dispatch: Boolean(dispatch),
    location: Boolean(location),
    messages: Boolean(message),
    auditHistory: Boolean(auditEntry),
  };
}

async function deleteDriver(id, actorId, reason) {
  const driver = await User.findById(id);
  if (!driver || driver.role !== ROLES.DRIVER) return null;

  const references = await getDriverReferences(id);
  const isReferenced = Object.values(references).some(Boolean);

  if (isReferenced) {
    await auditService.logChange({
      entity: 'User',
      entityId: id,
      action: 'DRIVER_DELETE_BLOCKED',
      changes: [{ field: 'driver', oldValue: driverSnapshot(driver), newValue: null }],
      performedBy: actorId,
    });
    throw new HttpError(
      409,
      'No se puede eliminar porque este chofer tiene historial operativo. Desactívalo en su lugar.',
      { code: 'DRIVER_HAS_REFERENCES', references }
    );
  }

  await User.findByIdAndDelete(id);

  // The User doc is gone, but its audit trail (including this very entry) is never touched —
  // "do not delete audit history" holds regardless of whether the referenced entity still exists.
  const reasonChange = reason ? [{ field: 'reason', oldValue: null, newValue: String(reason).trim() }] : [];
  await auditService.logChange({
    entity: 'User',
    entityId: id,
    action: 'DRIVER_DELETE',
    changes: [{ field: 'driver', oldValue: driverSnapshot(driver), newValue: null }, ...reasonChange],
    performedBy: actorId,
  });

  return driver;
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  listUsers,
  findDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  getDriverReferences,
};
