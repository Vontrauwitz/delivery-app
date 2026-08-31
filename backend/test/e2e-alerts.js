// Focused regression suite for the Alertas checkpoint (PLAN.md's "SIGUIENTE FASE PLANIFICADA"):
// AlertRule configuration, the deterministic evaluation/dedupe/auto-resolve engine for each
// supported rule, acknowledgement, and AuditLog coverage. Does not re-test schedule-resolution's
// own priority-chain math (already covered by unit-schedule-resolution.js) — only that this
// module's rules consume that output correctly.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets and
// reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-alerts.js (or: npm run test:e2e:alerts)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, runDbTask, finish } = require('./helpers');
const { getIsoWeekday, toDateKey } = require('../src/shared/scheduleResolution');

const FAKE_ID = '6a0000000000000000000000';

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const managerId = managerLogin.data.user.id;

  const driver1Login = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driver1Token = driver1Login.data.token;
  const driver1Id = driver1Login.data.user.id;

  const products = (await req('/products', { token: managerToken, expectStatus: 200 })).data;
  const byName = (name) => products.find((p) => p.name === name);

  async function auditActions(entity, entityId) {
    const res = await req(`/audit?entity=${entity}&entityId=${entityId}`, { token: managerToken, expectStatus: 200 });
    return res.data;
  }
  async function countAction(entity, entityId, action) {
    return (await auditActions(entity, entityId)).filter((e) => e.action === action).length;
  }
  async function findOpenAlert(ruleKey, driverId) {
    const list = (await req(`/alerts?ruleKey=${ruleKey}&driver=${driverId}&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
    return list[0] || null;
  }
  async function findAnyAlert(ruleKey, driverId) {
    const list = (await req(`/alerts?ruleKey=${ruleKey}&driver=${driverId}`, { token: managerToken, expectStatus: 200 })).data;
    return list[0] || null;
  }

  // =========================================================================
  // RULES — configuration
  // =========================================================================

  const rulesRes = await req('/alerts/rules', { token: managerToken, expectStatus: 200 });
  const ruleKeys = rulesRes.data.map((r) => r.key).sort();
  assert(
    JSON.stringify(ruleKeys) ===
      JSON.stringify(['DRIVER_LATE_START', 'DRIVER_SHIFT_OVERRUN', 'LOCATION_STALE', 'LOW_INVENTORY', 'PENDING_APPROVAL_TOO_LONG'].sort()),
    'default rules are available with no manual setup'
  );
  const lateStartDefault = rulesRes.data.find((r) => r.key === 'DRIVER_LATE_START');
  assert(lateStartDefault.enabled === true && lateStartDefault.severity === 'WARNING' && lateStartDefault.config.graceMinutes === 15, 'DRIVER_LATE_START default matches PLAN.md');

  await req('/alerts/rules/DRIVER_LATE_START', { method: 'PATCH', token: driver1Token, body: { enabled: false }, expectStatus: 403 });

  const updated = await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', {
    method: 'PATCH',
    token: managerToken,
    body: { config: { pendingMinutes: 90 } },
    expectStatus: 200,
  });
  assert(updated.data.config.pendingMinutes === 90, 'manager can update a supported rule');
  assert((await countAction('AlertRule', updated.data._id, 'ALERT_RULE_UPDATED')) === 1, 'rule update creates exactly one audit event');

  await req('/alerts/rules/NOT_A_REAL_RULE', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 400 });
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { severity: 'URGENT' }, expectStatus: 400 });
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { config: { pendingMinutes: -5 } }, expectStatus: 400 });
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { config: { pendingMinutes: 0 } }, expectStatus: 400 });
  assert((await countAction('AlertRule', updated.data._id, 'ALERT_RULE_UPDATED')) === 1, 'invalid/unauthorized rule updates created zero additional audit events');

  // restore default for the rest of the suite
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { config: { pendingMinutes: 60 } }, expectStatus: 200 });

  // =========================================================================
  // DRIVER_LATE_START
  // =========================================================================

  const todayWeekday = getIsoWeekday(new Date());
  const todayKey = toDateKey(new Date());

  // scheduledStart is clamped to never go earlier than local midnight today — a plain
  // `now - minutesAgoStart` (as used previously) crosses into YESTERDAY's local calendar day
  // whenever this runs within `minutesAgoStart` minutes of local midnight, which makes the
  // day-scoped schedule lookup miss the ScheduledShift entirely (the exact, real flake this hit
  // for the 60-min-ago DRIVER_SHIFT_OVERRUN case). Same principle as the driver-schedule midnight
  // fix in e2e-driver-schedule.js: only scheduledStart's calendar day matters for that lookup, so
  // clamping only it is sufficient. This still tests the intended "N minutes late" scenario in the
  // overwhelming majority of real run times — the same wall-clock tradeoff already accepted there.
  async function setScheduledShift(driverId, minutesAgoStart) {
    return runDbTask(async () => {
      const ScheduledShift = require('../src/modules/scheduledShifts/scheduledShift.model');
      await ScheduledShift.deleteMany({ driver: driverId });
      const now = new Date();
      const naiveStart = new Date(now.getTime() - minutesAgoStart * 60000);
      const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const scheduledStart = naiveStart.getTime() > localMidnight.getTime() ? naiveStart : new Date(localMidnight.getTime() + 60000);
      const scheduledEnd = new Date(scheduledStart.getTime() + 8 * 60 * 60 * 1000);
      return ScheduledShift.create({ driver: driverId, scheduledStart, scheduledEnd, createdBy: managerId });
    });
  }

  // 14 min late — under the 15 min default grace: no alert yet.
  await setScheduledShift(driver1Id, 14);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findOpenAlert('DRIVER_LATE_START', driver1Id)) === null, 'no DRIVER_LATE_START alert before the grace period elapses (time-boundary: 14min < 15min grace)');

  // Exactly 15 min late — at the grace boundary: alert fires (boundary is inclusive).
  await setScheduledShift(driver1Id, 15);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const lateAlert = await findOpenAlert('DRIVER_LATE_START', driver1Id);
  assert(!!lateAlert, 'DRIVER_LATE_START alert fires once the grace period elapses (time-boundary: 15min >= 15min grace)');
  assert(lateAlert.severity === 'WARNING', 'the alert snapshots the rule severity');

  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const lateAlertAgain = await findOpenAlert('DRIVER_LATE_START', driver1Id);
  assert(lateAlertAgain._id === lateAlert._id, 'repeated evaluation does not duplicate the DRIVER_LATE_START alert');

  // Driver finally starts their shift -> condition disappears -> alert resolves.
  await req('/work-shifts/start', { method: 'POST', token: driver1Token, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const lateAlertAfterStart = await findAnyAlert('DRIVER_LATE_START', driver1Id);
  assert(lateAlertAfterStart.status === 'RESOLVED', 'starting the WorkShift resolves the DRIVER_LATE_START alert');
  await req('/work-shifts/end', { method: 'PATCH', token: driver1Token, expectStatus: 200 });

  // A driver with no schedule at all today never alerts.
  const driver2 = await createExtraUser({ name: 'Driver Two', email: 'driver2@delivery.test', role: 'driver' });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findAnyAlert('DRIVER_LATE_START', driver2._id)) === null, 'a driver not scheduled today never gets a DRIVER_LATE_START alert');

  // Give driver2 a working recurring default shift covering right now, then suppress it with a
  // REST exception for today -> no alert despite what the default shift alone would imply.
  await req(`/driver-schedule/drivers/${driver2._id}/default-shift`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Turno normal', startTime: '00:00', durationMinutes: 60, activeDays: [todayWeekday], enabled: true, effectiveFrom: todayKey },
    expectStatus: 200,
  });
  await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver2._id, date: todayKey, type: 'REST', reason: 'Descanso' },
    expectStatus: 201,
  });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findAnyAlert('DRIVER_LATE_START', driver2._id)) === null, 'a REST schedule exception suppresses the DRIVER_LATE_START alert');

  // An explicit ScheduledShift still outranks the REST exception (existing priority chain).
  await setScheduledShift(driver2._id, 20);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(!!(await findOpenAlert('DRIVER_LATE_START', driver2._id)), 'an explicit ScheduledShift still takes priority over a REST exception, per the existing resolution chain');

  await runDbTask(async () => {
    const ScheduledShift = require('../src/modules/scheduledShifts/scheduledShift.model');
    await ScheduledShift.deleteMany({ driver: driver2._id });
  });

  // =========================================================================
  // DRIVER_SHIFT_OVERRUN (not explicitly enumerated in the test spec, but a real shipped rule —
  // covered here for basic correctness).
  // =========================================================================

  const overrunShift = await setScheduledShift(driver1Id, 60); // started an hour ago, 8h scheduled duration
  await req('/work-shifts/start', { method: 'POST', token: driver1Token, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findOpenAlert('DRIVER_SHIFT_OVERRUN', driver1Id)) === null, 'no DRIVER_SHIFT_OVERRUN alert while still within the scheduled window');

  // Only scheduledEnd needs to move into the past — SHOULD_HAVE_ENDED/endDiffMinutes only look
  // at "now vs. expectedEnd" for an OPEN shift, independent of when it actually started; its
  // calendar day isn't schedule-lookup-scoped the way scheduledStart's is. But it must still stay
  // chronologically AFTER scheduledStart to represent a coherent shift — so it's anchored to the
  // actual (possibly midnight-clamped) scheduledStart above, not to raw wall-clock `now`, using
  // the same clamp technique as setScheduledShift itself: `now - 40min` in the overwhelming
  // majority of real run times, falling back to scheduledStart + 1min only in the rare case where
  // that would otherwise land at or before the shift's own start.
  const naiveOverrunEnd = new Date(Date.now() - 40 * 60 * 1000);
  const overrunEnd =
    naiveOverrunEnd.getTime() > overrunShift.scheduledStart.getTime() + 60000
      ? naiveOverrunEnd
      : new Date(overrunShift.scheduledStart.getTime() + 60000);
  await runDbTask(async () => {
    const ScheduledShift = require('../src/modules/scheduledShifts/scheduledShift.model');
    await ScheduledShift.updateMany({ driver: driver1Id }, { $set: { scheduledEnd: overrunEnd } });
  });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(!!(await findOpenAlert('DRIVER_SHIFT_OVERRUN', driver1Id)), 'DRIVER_SHIFT_OVERRUN alert fires once the open shift runs well past its expected end (grace 30min)');

  await req('/work-shifts/end', { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findAnyAlert('DRIVER_SHIFT_OVERRUN', driver1Id)).status === 'RESOLVED', 'ending the shift resolves DRIVER_SHIFT_OVERRUN');

  await runDbTask(async () => {
    const ScheduledShift = require('../src/modules/scheduledShifts/scheduledShift.model');
    await ScheduledShift.deleteMany({});
  });

  // =========================================================================
  // LOCATION_STALE
  // =========================================================================

  const driver3 = await createExtraUser({ name: 'Driver Three', email: 'driver3@delivery.test', role: 'driver' });
  const vehicle3 = await runDbTask(async () => {
    const Vehicle = require('../src/modules/vehicles/vehicle.model');
    return Vehicle.create({ name: 'Carrito 3', assignedDriver: driver3._id, active: true });
  });
  const driver3Login = await req('/auth/login', { method: 'POST', body: { email: 'driver3@delivery.test', password: '123456' } });
  const driver3Token = driver3Login.data.token;

  await req('/work-shifts/start', { method: 'POST', token: driver3Token, expectStatus: 201 });
  await req('/locations', { method: 'POST', token: driver3Token, body: { latitude: 19.0, longitude: -99.0 }, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findOpenAlert('LOCATION_STALE', driver3._id)) === null, 'a fresh location ping creates no LOCATION_STALE alert');

  await runDbTask(async () => {
    const LocationPing = require('../src/modules/locations/location.model');
    await LocationPing.deleteMany({ driver: driver3._id });
    await LocationPing.create({ driver: driver3._id, latitude: 19.0, longitude: -99.0, serverTimestamp: new Date(Date.now() - 20 * 60 * 1000) });
  });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const staleAlert = await findOpenAlert('LOCATION_STALE', driver3._id);
  assert(!!staleAlert, 'a stale (20min old) location ping creates a LOCATION_STALE alert (threshold 15min)');

  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findOpenAlert('LOCATION_STALE', driver3._id))._id === staleAlert._id, 'repeated evaluation does not duplicate the LOCATION_STALE alert');

  await req('/locations', { method: 'POST', token: driver3Token, body: { latitude: 19.1, longitude: -99.1 }, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findAnyAlert('LOCATION_STALE', driver3._id)).status === 'RESOLVED', 'a new fresh ping resolves the LOCATION_STALE alert');

  // An off-shift driver (driver2, never started a WorkShift) is never flagged, no matter how
  // stale (or absent) their location is.
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  assert((await findAnyAlert('LOCATION_STALE', driver2._id)) === null, 'an off-shift driver is never flagged by LOCATION_STALE');

  await req('/work-shifts/end', { method: 'PATCH', token: driver3Token, expectStatus: 200 });

  // =========================================================================
  // LOW_INVENTORY
  // =========================================================================

  const delfin = byName('Delfín');
  const puerco = byName('Nariz de puerco');

  await req(`/replenishment/config/${delfin._id}`, { method: 'PUT', token: managerToken, body: { coverageDays: 3, safetyStock: 3 }, expectStatus: 200 });
  await req('/inventory-sessions/replenish', { method: 'POST', token: managerToken, body: { driver: driver1Id, items: [{ product: delfin._id, quantity: 10 }] }, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const delfinAlerts = (await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })).data.filter(
    (a) => a.metadata.productId === delfin._id
  );
  assert(delfinAlerts.length === 0, 'stock above the safety threshold creates no LOW_INVENTORY alert (existing replenishment config is authoritative)');

  await req(`/replenishment/config/${puerco._id}`, { method: 'PUT', token: managerToken, body: { coverageDays: 3, safetyStock: 2 }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const lowInvList = (await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const lowInvAlert = lowInvList.find((a) => a.metadata.productId === puerco._id);
  assert(!!lowInvAlert, 'stock at/below the safety threshold (0 <= 2, never replenished) creates a LOW_INVENTORY alert');

  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const lowInvListAgain = (await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  assert(lowInvListAgain.filter((a) => a.metadata.productId === puerco._id).length === 1, 'repeated evaluation does not duplicate the LOW_INVENTORY alert');

  await req('/inventory-sessions/replenish', { method: 'POST', token: managerToken, body: { driver: driver1Id, items: [{ product: puerco._id, quantity: 10 }] }, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const resolvedAlert = await req(`/alerts/${lowInvAlert._id}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedAlert.data.status === 'RESOLVED', 'replenishing stock above the threshold resolves the LOW_INVENTORY alert');

  // =========================================================================
  // PENDING_APPROVAL_TOO_LONG
  // =========================================================================

  // Selling requires an open WorkShift.
  await req('/work-shifts/start', { method: 'POST', token: driver1Token, expectStatus: 201 });

  const perro = byName('Perro');
  const recentSale = await req('/sales', {
    method: 'POST',
    token: driver1Token,
    body: { items: [{ product: perro._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: perro.basePrice }] },
    expectStatus: 201,
  });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const recentSaleAlerts = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data.filter(
    (a) => a.relatedEntity?.id === recentSale.data._id
  );
  assert(recentSaleAlerts.length === 0, 'a recently-created PENDING sale creates no alert yet');

  const oldSale = await req('/sales', {
    method: 'POST',
    token: driver1Token,
    body: { items: [{ product: perro._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: perro.basePrice }] },
    expectStatus: 201,
  });
  await runDbTask(async (mongooseInstance) => {
    // Mongoose's timestamps plugin silently strips a user-supplied createdAt from Model.updateOne
    // (it only ever manages updatedAt on updates) — going through the raw collection, same as
    // helpers.js's own resetAndSeed(), is what actually persists the backdate.
    const { ObjectId } = mongooseInstance.Types;
    await mongooseInstance.connection.db
      .collection('sales')
      .updateOne({ _id: new ObjectId(oldSale.data._id) }, { $set: { createdAt: new Date(Date.now() - 90 * 60 * 1000) } });
  });
  // Done selling — close the shift so this driver doesn't also start tripping LOCATION_STALE
  // (no ping) for the remainder of the suite.
  await req('/work-shifts/end', { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  let pendingList = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const oldSaleAlert = pendingList.find((a) => a.relatedEntity?.id === oldSale.data._id);
  assert(!!oldSaleAlert, 'a PENDING sale older than the threshold (90min > 60min) creates an alert');

  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  pendingList = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  assert(pendingList.filter((a) => a.relatedEntity?.id === oldSale.data._id).length === 1, 'repeated evaluation does not duplicate the PENDING_APPROVAL_TOO_LONG alert');

  await req(`/approvals/${oldSale.data._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const oldSaleAlertAfter = await req(`/alerts/${oldSaleAlert._id}`, { token: managerToken, expectStatus: 200 });
  assert(oldSaleAlertAfter.data.status === 'RESOLVED', 'approving the sale resolves the PENDING_APPROVAL_TOO_LONG alert');

  // =========================================================================
  // ACKNOWLEDGEMENT
  // =========================================================================

  const corona = byName('Corona');
  await req(`/replenishment/config/${corona._id}`, { method: 'PUT', token: managerToken, body: { coverageDays: 3, safetyStock: 2 }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const ackTargetList = (await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const ackTarget = ackTargetList.find((a) => a.metadata.productId === corona._id);
  assert(!!ackTarget, 'setup: a fresh OPEN alert exists for acknowledgement tests');

  await req(`/alerts/${ackTarget._id}/acknowledge`, { method: 'POST', token: driver1Token, expectStatus: 403 });

  const acked = await req(`/alerts/${ackTarget._id}/acknowledge`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(acked.data.status === 'ACKNOWLEDGED', 'OPEN -> ACKNOWLEDGED works');
  assert(acked.data.acknowledgedBy._id === managerId && !!acked.data.acknowledgedAt, 'acknowledgement records the manager identity and time');

  const ackedAgain = await req(`/alerts/${ackTarget._id}/acknowledge`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(ackedAgain.data.status === 'ACKNOWLEDGED', 'a second acknowledge is idempotent (no error, stays ACKNOWLEDGED)');
  assert((await countAction('OperationalAlert', ackTarget._id, 'ALERT_ACKNOWLEDGED')) === 1, 'acknowledgement creates exactly one audit event, even after a repeated acknowledge');

  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const stillAcked = await req(`/alerts/${ackTarget._id}`, { token: managerToken, expectStatus: 200 });
  assert(stillAcked.data.status === 'ACKNOWLEDGED', 'acknowledgement does not resolve the underlying condition — it stays ACKNOWLEDGED while the condition remains true');

  await req('/inventory-sessions/replenish', { method: 'POST', token: managerToken, body: { driver: driver1Id, items: [{ product: corona._id, quantity: 10 }] }, expectStatus: 201 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const resolvedAck = await req(`/alerts/${ackTarget._id}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedAck.data.status === 'RESOLVED', 'clearing the condition later resolves a previously-ACKNOWLEDGED alert');

  // =========================================================================
  // DISABLED RULE LIFECYCLE SEMANTICS (correction checkpoint)
  //
  // Disabling a rule means "stop evaluating this condition" — it does NOT mean "the underlying
  // operational problem was resolved". Uses PENDING_APPROVAL_TOO_LONG throughout: unlike product
  // stock (which defaults to an already-triggering 0-vs-0 state for every untouched product),
  // a fresh Sale gives a clean, unambiguous starting condition with no background noise.
  // =========================================================================

  await req('/work-shifts/start', { method: 'POST', token: driver1Token, expectStatus: 201 });

  async function createOldPendingSale(minutesAgo) {
    const sale = await req('/sales', {
      method: 'POST',
      token: driver1Token,
      body: { items: [{ product: perro._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: perro.basePrice }] },
      expectStatus: 201,
    });
    await runDbTask(async (mongooseInstance) => {
      const { ObjectId } = mongooseInstance.Types;
      await mongooseInstance.connection.db
        .collection('sales')
        .updateOne({ _id: new ObjectId(sale.data._id) }, { $set: { createdAt: new Date(Date.now() - minutesAgo * 60 * 1000) } });
    });
    return sale.data;
  }

  // A. trigger alert -> disable rule -> evaluate -> alert remains OPEN.
  const saleA = await createOldPendingSale(90);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listA = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const alertA = listA.find((a) => a.relatedEntity?.id === saleA._id);
  assert(!!alertA, 'setup A: alert triggered');

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const afterDisableA = await req(`/alerts/${alertA._id}`, { token: managerToken, expectStatus: 200 });
  assert(afterDisableA.data.status === 'OPEN', 'A: disabling the rule leaves an existing OPEN alert OPEN');

  // B. acknowledge alert -> disable rule -> evaluate -> alert remains ACKNOWLEDGED.
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: true }, expectStatus: 200 });
  const saleB = await createOldPendingSale(90);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listB = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const alertB = listB.find((a) => a.relatedEntity?.id === saleB._id);
  assert(!!alertB, 'setup B: alert triggered');
  await req(`/alerts/${alertB._id}/acknowledge`, { method: 'POST', token: managerToken, expectStatus: 200 });

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const afterDisableB = await req(`/alerts/${alertB._id}`, { token: managerToken, expectStatus: 200 });
  assert(afterDisableB.data.status === 'ACKNOWLEDGED', 'B: disabling the rule leaves an existing ACKNOWLEDGED alert ACKNOWLEDGED');

  // C. disable rule before the condition exists -> condition becomes true -> evaluate -> no alert created.
  // (rule is still disabled here, continuing from B)
  const saleC = await createOldPendingSale(90);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listC = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG`, { token: managerToken, expectStatus: 200 })).data;
  const alertC = listC.find((a) => a.relatedEntity?.id === saleC._id);
  assert(!alertC, 'C: a condition that becomes true while the rule is disabled creates no alert');

  // D. active alert -> disable (already disabled) -> condition remains true -> re-enable -> evaluate
  //    -> the same active alert (A) is reused/touched, not duplicated. Re-enabling also picks up
  //    C's now-true condition for the first time (expected — it was never evaluated before).
  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: true }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listD = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const matchesD = listD.filter((a) => a.relatedEntity?.id === saleA._id);
  assert(matchesD.length === 1 && matchesD[0]._id === alertA._id, 'D: re-enabling with the condition still true reuses the same alert, no duplicate');
  const alertCAfterReenable = listD.find((a) => a.relatedEntity?.id === saleC._id);
  assert(!!alertCAfterReenable, 'D (side-effect): C\'s condition, still true, is now picked up on the first evaluation after re-enabling');

  // E. active alert -> disable -> underlying condition clears -> re-enable -> evaluate -> resolves.
  const saleE = await createOldPendingSale(90);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listE = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const alertE = listE.find((a) => a.relatedEntity?.id === saleE._id);
  assert(!!alertE, 'setup E: alert triggered');

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 200 });
  await req(`/approvals/${saleE._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const stillOpenE = await req(`/alerts/${alertE._id}`, { token: managerToken, expectStatus: 200 });
  assert(stillOpenE.data.status === 'OPEN', 'E (interim): clearing the condition while the rule is disabled does not resolve the alert yet');

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: true }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const resolvedE = await req(`/alerts/${alertE._id}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedE.data.status === 'RESOLVED', 'E: re-enabling after the condition cleared while disabled resolves the existing alert');

  // =========================================================================
  // GET /alerts SIDE EFFECT
  //
  // GET /alerts is intentionally server-authoritative and evaluates before listing — confirm
  // that path specifically (not just POST /alerts/evaluate) also respects dedupe, creates no
  // AuditLog noise, preserves acknowledgement, and honors disabled-rule semantics.
  // =========================================================================

  const saleG = await createOldPendingSale(90);
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const listG = (await req(`/alerts?ruleKey=PENDING_APPROVAL_TOO_LONG&status=OPEN`, { token: managerToken, expectStatus: 200 })).data;
  const alertG = listG.find((a) => a.relatedEntity?.id === saleG._id);
  assert(!!alertG, 'setup G: alert triggered');
  await req(`/alerts/${alertG._id}/acknowledge`, { method: 'POST', token: managerToken, expectStatus: 200 });

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 200 });

  const auditBeforeG = await countAction('OperationalAlert', alertG._id, 'ALERT_ACKNOWLEDGED');
  const totalAlertsBeforeG = (await req('/alerts', { token: managerToken, expectStatus: 200 })).data.length;
  const totalAlertsAfterG = (await req('/alerts', { token: managerToken, expectStatus: 200 })).data.length;
  assert(totalAlertsBeforeG === totalAlertsAfterG, 'GET /alerts (its internal evaluate) creates no duplicate alerts across repeated calls');

  const stillAckedG = await req(`/alerts/${alertG._id}`, { token: managerToken, expectStatus: 200 });
  assert(stillAckedG.data.status === 'ACKNOWLEDGED', "GET /alerts's internal evaluation leaves a disabled rule's ACKNOWLEDGED alert untouched");

  const auditAfterG = await countAction('OperationalAlert', alertG._id, 'ALERT_ACKNOWLEDGED');
  assert(auditAfterG === auditBeforeG, 'GET /alerts creates zero AuditLog noise through its internal evaluation');

  await req('/alerts/rules/PENDING_APPROVAL_TOO_LONG', { method: 'PATCH', token: managerToken, body: { enabled: true }, expectStatus: 200 });
  await req('/work-shifts/end', { method: 'PATCH', token: driver1Token, expectStatus: 200 });

  // =========================================================================
  // GENERAL
  // =========================================================================

  const historyList = (await req(`/alerts?status=RESOLVED`, { token: managerToken, expectStatus: 200 })).data;
  assert(historyList.some((a) => a._id === resolvedAck.data._id), 'RESOLVED history remains queryable');

  await req('/alerts', { method: 'POST', token: managerToken, body: { title: 'inventada' }, expectStatus: 404 });

  // Delfín currently has 10 in stock against a safetyStock of 3 (set earlier) — its OPEN alert
  // from that was already resolved (a stale RESOLVED record from the very first evaluate() of
  // this suite, back when every product defaulted to safetyStock 0, may still exist in history —
  // filtering by status=OPEN server-side, same as earlier in this section, is what actually
  // isolates "no NEW alert appeared" from "there's unrelated resolved history").
  await req(`/replenishment/config/${delfin._id}`, { method: 'PUT', token: managerToken, body: { coverageDays: 3, safetyStock: 15 }, expectStatus: 200 });
  await req('/alerts/rules/LOW_INVENTORY', { method: 'PATCH', token: managerToken, body: { enabled: false }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  let delfinAlertsAfterDisable = (
    await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })
  ).data.filter((a) => a.metadata.productId === delfin._id);
  assert(delfinAlertsAfterDisable.length === 0, 'a disabled rule suppresses alert creation, even though the condition is true');

  await req('/alerts/rules/LOW_INVENTORY', { method: 'PATCH', token: managerToken, body: { enabled: true }, expectStatus: 200 });
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  delfinAlertsAfterDisable = (
    await req(`/alerts?ruleKey=LOW_INVENTORY&driver=${driver1Id}&status=OPEN`, { token: managerToken, expectStatus: 200 })
  ).data.filter((a) => a.metadata.productId === delfin._id);
  assert(delfinAlertsAfterDisable.length === 1 && delfinAlertsAfterDisable[0].status === 'OPEN', 're-enabling the rule resumes alert creation on the next evaluation');

  const beforeCount = (await req('/alerts', { token: managerToken, expectStatus: 200 })).data.length;
  await req('/alerts/evaluate', { method: 'POST', token: managerToken, expectStatus: 200 });
  const afterCount = (await req('/alerts', { token: managerToken, expectStatus: 200 })).data.length;
  assert(beforeCount === afterCount, 'evaluating with no state changes never injects duplicate alerts');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
