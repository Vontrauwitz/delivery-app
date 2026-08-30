const AlertRule = require('./alertRule.model');
const OperationalAlert = require('./operationalAlert.model');
const HttpError = require('../../shared/httpError');
const auditService = require('../audit/audit.service');
const usersService = require('../users/users.service');
const driverScheduleService = require('../driverSchedule/driverSchedule.service');
const workShiftsService = require('../workShifts/workShifts.service');
const locationsService = require('../locations/locations.service');
const replenishmentService = require('../replenishment/replenishment.service');
const approvalsService = require('../approvals/approvals.service');
const { toDateKey } = require('../../shared/scheduleResolution');
const {
  ROLES,
  ALERT_SEVERITIES,
  OPERATIONAL_ALERT_STATUSES: STATUS,
  ALERT_RULE_KEYS: RULE_KEYS,
  WORK_SHIFT_STATUSES,
} = require('../../shared/constants');

// ---------------------------------------------------------------------------------------------
// Rule configuration — defaults, seeding, validation, update.
// ---------------------------------------------------------------------------------------------

// Defaults from PLAN.md's Alertas checkpoint — a starting point, not a hard business rule; a
// manager can change every one of these via updateRule.
const DEFAULT_RULES = [
  { key: RULE_KEYS.DRIVER_LATE_START, name: 'Chofer no inició turno a tiempo', severity: ALERT_SEVERITIES.WARNING, config: { graceMinutes: 15 } },
  { key: RULE_KEYS.DRIVER_SHIFT_OVERRUN, name: 'Turno abierto más allá de lo esperado', severity: ALERT_SEVERITIES.WARNING, config: { graceMinutes: 30 } },
  { key: RULE_KEYS.LOCATION_STALE, name: 'Ubicación desactualizada durante el turno', severity: ALERT_SEVERITIES.WARNING, config: { staleMinutes: 15 } },
  { key: RULE_KEYS.LOW_INVENTORY, name: 'Inventario en o bajo el stock de seguridad', severity: ALERT_SEVERITIES.WARNING, config: {} },
  { key: RULE_KEYS.PENDING_APPROVAL_TOO_LONG, name: 'Venta pendiente de aprobar hace demasiado tiempo', severity: ALERT_SEVERITIES.WARNING, config: { pendingMinutes: 60 } },
];

// Which config fields are meaningful for each rule key — the controlled schema the config sub-
// document validates against. Any field outside this list is silently dropped on update, never
// stored: this is what keeps `config` from becoming an arbitrary client-supplied object.
const CONFIG_FIELDS_BY_RULE = {
  [RULE_KEYS.DRIVER_LATE_START]: ['graceMinutes'],
  [RULE_KEYS.DRIVER_SHIFT_OVERRUN]: ['graceMinutes'],
  [RULE_KEYS.LOCATION_STALE]: ['staleMinutes'],
  [RULE_KEYS.LOW_INVENTORY]: [],
  [RULE_KEYS.PENDING_APPROVAL_TOO_LONG]: ['pendingMinutes'],
};

const MAX_THRESHOLD_MINUTES = 1440; // 24h — a sane upper bound, not a business rule of its own.

// Idempotent — safe to call on every listRules(); only inserts documents that don't exist yet,
// never touches an existing rule's manager-configured values. Same "fills in only what's
// missing" spirit as the non-destructive `npm run seed` script.
async function ensureDefaultRules() {
  await Promise.all(
    DEFAULT_RULES.map((def) =>
      AlertRule.findOneAndUpdate(
        { key: def.key },
        { $setOnInsert: { ...def, createdBy: null, updatedBy: null } },
        { upsert: true, setDefaultsOnInsert: true }
      )
    )
  );
}

async function listRules() {
  await ensureDefaultRules();
  return AlertRule.find({}).sort({ key: 1 });
}

function validateConfigForRule(key, incoming, existing) {
  const allowedFields = CONFIG_FIELDS_BY_RULE[key];
  const result = {};
  for (const field of allowedFields) {
    const value = incoming[field] !== undefined ? incoming[field] : existing?.[field];
    if (value === undefined || value === null) {
      throw new HttpError(400, `${field} es requerido para ${key}`);
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
      throw new HttpError(400, `${field} debe ser un número entero positivo`);
    }
    if (num > MAX_THRESHOLD_MINUTES) {
      throw new HttpError(400, `${field} no puede exceder ${MAX_THRESHOLD_MINUTES} minutos`);
    }
    result[field] = num;
  }
  return result;
}

async function updateRule(key, { enabled, severity, config }, actorId) {
  if (!Object.values(RULE_KEYS).includes(key)) {
    throw new HttpError(400, 'Regla de alerta desconocida');
  }
  await ensureDefaultRules();
  const rule = await AlertRule.findOne({ key });
  if (!rule) {
    throw new HttpError(404, 'Regla de alerta no encontrada');
  }

  const before = rule.toObject();
  const changes = [];

  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') {
      throw new HttpError(400, 'enabled debe ser verdadero o falso');
    }
    if (enabled !== rule.enabled) {
      changes.push({ field: 'enabled', oldValue: rule.enabled, newValue: enabled });
      rule.enabled = enabled;
    }
  }

  if (severity !== undefined) {
    if (!Object.values(ALERT_SEVERITIES).includes(severity)) {
      throw new HttpError(400, 'severity inválida');
    }
    if (severity !== rule.severity) {
      changes.push({ field: 'severity', oldValue: rule.severity, newValue: severity });
      rule.severity = severity;
    }
  }

  if (config !== undefined) {
    const validatedConfig = validateConfigForRule(key, config, before.config);
    if (JSON.stringify(validatedConfig) !== JSON.stringify(before.config || {})) {
      changes.push({ field: 'config', oldValue: before.config, newValue: validatedConfig });
      rule.config = validatedConfig;
    }
  }

  if (changes.length === 0) {
    return rule;
  }

  rule.updatedBy = actorId;
  await rule.save();

  await auditService.logChange({
    entity: 'AlertRule',
    entityId: rule._id,
    action: 'ALERT_RULE_UPDATED',
    changes,
    performedBy: actorId,
  });

  return rule;
}

// ---------------------------------------------------------------------------------------------
// Rule evaluators — each returns the CURRENT set of true conditions for that rule, as plain
// {dedupeKey, driver, vehicle, relatedEntity, title, summary, metadata} objects. Nothing here
// touches the database beyond reading; evaluateRule() below is what creates/refreshes/resolves
// OperationalAlert documents from what these return.
// ---------------------------------------------------------------------------------------------

async function evalDriverLateStart(rule) {
  const graceMinutes = rule.config.graceMinutes;
  const now = new Date();
  const statuses = await driverScheduleService.getStatusForAllDrivers(now);
  const active = [];

  for (const s of statuses) {
    if (s.status !== 'NOT_STARTED' || !s.expected.expectedStart) continue;
    const expectedStart = new Date(s.expected.expectedStart);
    const minutesLate = Math.round((now.getTime() - expectedStart.getTime()) / 60000);
    if (minutesLate < graceMinutes) continue;

    active.push({
      dedupeKey: `DRIVER_LATE_START:${s.driver._id}:${toDateKey(now)}`,
      driver: s.driver._id,
      vehicle: null,
      relatedEntity: null,
      title: `${s.driver.name}: no ha iniciado turno`,
      summary: `Turno esperado no iniciado, ${minutesLate} min después de la hora esperada (tolerancia ${graceMinutes} min).`,
      metadata: { expectedStart, graceMinutes, minutesLate },
    });
  }

  return active;
}

async function evalDriverShiftOverrun(rule) {
  const graceMinutes = rule.config.graceMinutes;
  const now = new Date();
  const statuses = await driverScheduleService.getStatusForAllDrivers(now);
  const active = [];

  for (const s of statuses) {
    if (s.status !== 'SHOULD_HAVE_ENDED' || !s.workShift || s.endDiffMinutes == null) continue;
    if (s.endDiffMinutes < graceMinutes) continue;

    active.push({
      dedupeKey: `DRIVER_SHIFT_OVERRUN:${s.driver._id}:${s.workShift._id}`,
      driver: s.driver._id,
      vehicle: null,
      relatedEntity: { type: 'WorkShift', id: s.workShift._id },
      title: `${s.driver.name}: turno abierto más allá de lo esperado`,
      summary: `El turno sigue abierto ${s.endDiffMinutes} min después del fin esperado (tolerancia ${graceMinutes} min).`,
      metadata: { expectedEnd: s.expected.expectedEnd, graceMinutes, minutesOver: s.endDiffMinutes, workShiftId: s.workShift._id },
    });
  }

  return active;
}

// Only drivers with a currently OPEN WorkShift are considered "operational" for this rule — a
// driver off shift is never flagged here, regardless of how old their last ping is.
async function evalLocationStale(rule) {
  const staleMinutes = rule.config.staleMinutes;
  const now = Date.now();
  const openShifts = await workShiftsService.listShifts({ status: WORK_SHIFT_STATUSES.OPEN });
  const active = [];

  for (const shift of openShifts) {
    const driverId = shift.driver?._id || shift.driver;
    const ping = await locationsService.getLatestLocationForDriver(driverId);
    const ageMinutes = ping ? Math.round((now - new Date(ping.serverTimestamp).getTime()) / 60000) : null;

    if (ageMinutes === null || ageMinutes > staleMinutes) {
      active.push({
        dedupeKey: `LOCATION_STALE:${driverId}:${shift._id}`,
        driver: driverId,
        vehicle: shift.vehicle?._id || shift.vehicle || null,
        relatedEntity: { type: 'WorkShift', id: shift._id },
        title: `${shift.driver?.name || 'Chofer'}: ubicación desactualizada`,
        summary:
          ping != null
            ? `Última ubicación hace ${ageMinutes} min (umbral ${staleMinutes} min).`
            : 'Sin ninguna ubicación registrada durante el turno.',
        metadata: { lastPingAt: ping ? ping.serverTimestamp : null, staleMinutes, ageMinutes, workShiftId: shift._id },
      });
    }
  }

  return active;
}

// Reuses replenishment's own authoritative currentStock/safetyStock per driver+product — no
// second threshold system, per PLAN.md's explicit instruction.
async function evalLowInventory() {
  const drivers = await usersService.listUsers({ role: ROLES.DRIVER, active: true });
  const active = [];

  for (const driver of drivers) {
    const { rows } = await replenishmentService.getReplenishmentSuggestions(driver._id);
    for (const row of rows) {
      if (row.currentStock <= row.safetyStock) {
        active.push({
          dedupeKey: `LOW_INVENTORY:${driver._id}:${row.product._id}`,
          driver: driver._id,
          vehicle: null,
          relatedEntity: { type: 'Product', id: row.product._id },
          title: `${driver.name}: ${row.product.name} en o bajo stock de seguridad`,
          summary: `Quedan ${row.currentStock} (stock de seguridad: ${row.safetyStock}).`,
          metadata: { productId: row.product._id, productName: row.product.name, currentStock: row.currentStock, safetyStock: row.safetyStock },
        });
      }
    }
  }

  return active;
}

async function evalPendingApprovalTooLong(rule) {
  const pendingMinutes = rule.config.pendingMinutes;
  const now = Date.now();
  const pending = await approvalsService.listPending();
  const active = [];

  for (const sale of pending) {
    const minutesPending = Math.round((now - new Date(sale.createdAt).getTime()) / 60000);
    if (minutesPending < pendingMinutes) continue;

    active.push({
      dedupeKey: `PENDING_APPROVAL_TOO_LONG:${sale._id}`,
      driver: sale.driver?._id || sale.driver || null,
      vehicle: sale.vehicle?._id || sale.vehicle || null,
      relatedEntity: { type: 'Sale', id: sale._id },
      title: `Venta pendiente de aprobar hace ${minutesPending} min`,
      summary: `Chofer: ${sale.driver?.name || '—'}. Pendiente desde hace ${minutesPending} min (umbral ${pendingMinutes} min).`,
      metadata: { saleId: sale._id, pendingMinutes, minutesPending, createdAt: sale.createdAt },
    });
  }

  return active;
}

const RULE_EVALUATORS = {
  [RULE_KEYS.DRIVER_LATE_START]: evalDriverLateStart,
  [RULE_KEYS.DRIVER_SHIFT_OVERRUN]: evalDriverShiftOverrun,
  [RULE_KEYS.LOCATION_STALE]: evalLocationStale,
  [RULE_KEYS.LOW_INVENTORY]: evalLowInventory,
  [RULE_KEYS.PENDING_APPROVAL_TOO_LONG]: evalPendingApprovalTooLong,
};

// ---------------------------------------------------------------------------------------------
// Evaluation engine — deterministic, idempotent, server-authoritative. No cron/queue: this runs
// synchronously whenever a manager triggers it (POST /alerts/evaluate) or fetches the list
// (GET /alerts, which evaluates first) — see alerts.controller.
// ---------------------------------------------------------------------------------------------

async function createAlertForCondition(rule, cond) {
  try {
    await OperationalAlert.create({
      ruleKey: rule.key,
      type: rule.key,
      severity: rule.severity,
      status: STATUS.OPEN,
      title: cond.title,
      summary: cond.summary,
      driver: cond.driver || null,
      vehicle: cond.vehicle || null,
      relatedEntity: cond.relatedEntity || null,
      dedupeKey: cond.dedupeKey,
      active: true,
      firstTriggeredAt: new Date(),
      lastTriggeredAt: new Date(),
      metadata: cond.metadata || {},
    });
    return 'created';
  } catch (err) {
    // A concurrent evaluate() raced this exact dedupeKey into existence between our lookup and
    // this create — the partial unique index caught it. Touch the winner instead of duplicating.
    if (err.code === 11000) {
      const existing = await OperationalAlert.findOne({ dedupeKey: cond.dedupeKey, active: true });
      if (existing) {
        existing.lastTriggeredAt = new Date();
        existing.summary = cond.summary;
        existing.metadata = cond.metadata || {};
        await existing.save();
        return 'touched';
      }
    }
    throw err;
  }
}

async function evaluateRule(rule) {
  const activeConditions = await RULE_EVALUATORS[rule.key](rule);
  const activeDedupeKeys = new Set(activeConditions.map((c) => c.dedupeKey));

  const existingActiveAlerts = await OperationalAlert.find({ ruleKey: rule.key, active: true });
  const existingByDedupeKey = new Map(existingActiveAlerts.map((a) => [a.dedupeKey, a]));

  let created = 0;
  let touched = 0;
  let resolved = 0;

  for (const cond of activeConditions) {
    const existing = existingByDedupeKey.get(cond.dedupeKey);
    if (existing) {
      existing.lastTriggeredAt = new Date();
      existing.summary = cond.summary;
      existing.metadata = cond.metadata || {};
      await existing.save();
      touched++;
    } else {
      const outcome = await createAlertForCondition(rule, cond);
      if (outcome === 'created') created++;
      else touched++;
    }
  }

  for (const [dedupeKey, alert] of existingByDedupeKey) {
    if (!activeDedupeKeys.has(dedupeKey)) {
      alert.status = STATUS.RESOLVED;
      alert.active = false;
      alert.resolvedAt = new Date();
      await alert.save();
      resolved++;
    }
  }

  return { ruleKey: rule.key, created, touched, resolved };
}

async function evaluate() {
  const rules = await listRules();
  const results = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    results.push(await evaluateRule(rule));
  }

  return results;
}

// ---------------------------------------------------------------------------------------------
// Operational alerts — read/list/acknowledge. Never created directly by a client.
// ---------------------------------------------------------------------------------------------

async function getAlertById(id) {
  const alert = await OperationalAlert.findById(id)
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('acknowledgedBy', 'name email');
  if (!alert) {
    throw new HttpError(404, 'Alerta no encontrada');
  }
  return alert;
}

async function listAlerts(filter = {}, { evaluateFirst = true } = {}) {
  if (evaluateFirst) {
    await evaluate();
  }

  const query = {};
  if (filter.status) query.status = filter.status;
  if (filter.severity) query.severity = filter.severity;
  if (filter.ruleKey) query.ruleKey = filter.ruleKey;
  if (filter.driver) query.driver = filter.driver;
  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from) query.createdAt.$gte = new Date(filter.from);
    if (filter.to) query.createdAt.$lte = new Date(filter.to);
  }

  return OperationalAlert.find(query)
    .sort({ lastTriggeredAt: -1 })
    .populate('driver', 'name email')
    .populate('vehicle', 'name')
    .populate('acknowledgedBy', 'name email');
}

// OPEN -> ACKNOWLEDGED only. Re-acknowledging an already-ACKNOWLEDGED alert is a no-op (same
// idempotency convention as messaging's MESSAGE_READ) — it does not create a second audit event.
// Acknowledging a RESOLVED alert is rejected: RESOLVED is terminal for that occurrence.
async function acknowledgeAlert(id, actorId) {
  const alert = await OperationalAlert.findById(id);
  if (!alert) {
    throw new HttpError(404, 'Alerta no encontrada');
  }
  if (alert.status === STATUS.RESOLVED) {
    throw new HttpError(400, 'No se puede reconocer una alerta ya resuelta');
  }
  if (alert.status === STATUS.ACKNOWLEDGED) {
    return getAlertById(id);
  }

  alert.status = STATUS.ACKNOWLEDGED;
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = actorId;
  await alert.save();

  await auditService.logChange({
    entity: 'OperationalAlert',
    entityId: alert._id,
    action: 'ALERT_ACKNOWLEDGED',
    changes: [{ field: 'status', oldValue: STATUS.OPEN, newValue: STATUS.ACKNOWLEDGED }],
    performedBy: actorId,
  });

  return getAlertById(id);
}

module.exports = {
  listRules,
  updateRule,
  evaluate,
  listAlerts,
  getAlertById,
  acknowledgeAlert,
};
