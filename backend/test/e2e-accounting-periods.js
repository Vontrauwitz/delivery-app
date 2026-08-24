// Regression suite for: global AccountingPeriod lifecycle (Sale attribution, close-and-open-next),
// the 10-product seeded order, and ScheduledShift <-> WorkShift matching (closest-within-tolerance,
// match-once, never re-matched, never modifies the WorkShift).
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-accounting-periods.js  (or: npm run test:e2e:accounting-periods)

const { assert, req, assertServerReachable, resetAndSeed, runDbTask, finish } = require('./helpers');

const EXPECTED_PRODUCT_ORDER = [
  'Perro',
  'Ratón',
  'León',
  'Telaraña',
  'Grillo',
  'Mariposa',
  'Pollo',
  'Delfín',
  'Nariz de puerco',
  'Corona',
];

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;
  assert(managerLogin.status === 200 && driverLogin.status === 200, 'manager and driver login succeed');

  // ============================================================================
  // Product order
  // ============================================================================

  const products = (await req('/products', { token: driverToken })).data;
  assert(products.length === 10, 'seeded 10 products');
  assert(
    JSON.stringify(products.map((p) => p.name)) === JSON.stringify(EXPECTED_PRODUCT_ORDER),
    `products come back in the exact seeded order (got: ${products.map((p) => p.name).join(', ')})`
  );

  // ============================================================================
  // AccountingPeriod: exactly one global OPEN period, Sale attribution, close-and-open-next
  // ============================================================================

  await req('/accounting-periods/current', { token: driverToken, expectStatus: 403 });
  await req('/accounting-periods', { token: driverToken, expectStatus: 403 });
  await req('/accounting-periods/close', { method: 'PATCH', token: driverToken, expectStatus: 403 });

  const periodBefore = await req('/accounting-periods/current', { token: managerToken, expectStatus: 200 });
  assert(periodBefore.data.status === 'OPEN', 'there is exactly one OPEN accounting period after seed');

  await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  const perro = products.find((p) => p.name === 'Perro');
  await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock: products.map((p) => ({ product: p._id, quantity: 50 })) },
    expectStatus: 201,
  });

  const saleBeforeClose = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: perro._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: perro.basePrice }],
    },
    expectStatus: 201,
  });
  assert(
    saleBeforeClose.data.accountingPeriod._id === periodBefore.data._id,
    'a sale created now is attributed to the current OPEN accounting period'
  );

  const closeResult = await req('/accounting-periods/close', { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(closeResult.data.closed.status === 'CLOSED', 'closing the period marks the old one CLOSED');
  assert(closeResult.data.closed._id === periodBefore.data._id, 'the closed period is the one that was previously open');
  assert(closeResult.data.opened.status === 'OPEN', 'closing immediately opens the next period');
  assert(
    new Date(closeResult.data.opened.startedAt).getTime() === new Date(closeResult.data.closed.endedAt).getTime(),
    'the new period starts at the exact same timestamp the previous one ended'
  );

  const periodAfter = await req('/accounting-periods/current', { token: managerToken, expectStatus: 200 });
  assert(periodAfter.data._id === closeResult.data.opened._id, 'GET current now returns the newly opened period');
  assert(periodAfter.data._id !== periodBefore.data._id, 'the current period id changed after close');

  const saleAfterClose = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: perro._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: perro.basePrice }],
    },
    expectStatus: 201,
  });
  assert(
    saleAfterClose.data.accountingPeriod._id === periodAfter.data._id,
    'a sale created after the close is attributed to the NEW current period, not the old one'
  );

  const allPeriods = await req('/accounting-periods', { token: managerToken, expectStatus: 200 });
  assert(allPeriods.data.length === 2, 'both periods exist in history (got %s)'.replace('%s', allPeriods.data.length));
  assert(
    allPeriods.data.some((p) => p._id === periodBefore.data._id && p.status === 'CLOSED'),
    'the old period remains in history as CLOSED — never deleted'
  );

  // ============================================================================
  // ScheduledShift <-> WorkShift matching
  // ============================================================================

  // Clean slate for matching determinism — ignore the seed's own demo ScheduledShift, which is
  // pinned to a fixed wall-clock hour and would make "prefer the closest" nondeterministic
  // depending on what time this suite happens to run.
  await runDbTask(async (mongoose) => {
    await mongoose.connection.db.collection('scheduledshifts').deleteMany({});
  });

  const now = Date.now();
  const near = await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      scheduledStart: new Date(now - 1 * 60 * 1000).toISOString(), // 1 min ago
      scheduledEnd: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
    },
    expectStatus: 201,
  });
  const far = await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      scheduledStart: new Date(now - 20 * 60 * 60 * 1000).toISOString(), // 20h ago, still within the 36h tolerance
      scheduledEnd: new Date(now - 14 * 60 * 60 * 1000).toISOString(),
    },
    expectStatus: 201,
  });
  const tooFar = await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      scheduledStart: new Date(now - 40 * 60 * 60 * 1000).toISOString(), // 40h ago, outside the 36h tolerance
      scheduledEnd: new Date(now - 34 * 60 * 60 * 1000).toISOString(),
    },
    expectStatus: 201,
  });

  await req('/work-shifts/end', { method: 'PATCH', token: driverToken, expectStatus: 200 });
  const startResult = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  const newWorkShiftId = startResult.data._id;

  const scheduledList = await req(`/scheduled-shifts?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  const nearAfter = scheduledList.data.find((s) => s._id === near.data._id);
  const farAfter = scheduledList.data.find((s) => s._id === far.data._id);
  const tooFarAfter = scheduledList.data.find((s) => s._id === tooFar.data._id);

  assert(
    nearAfter.workShift && (nearAfter.workShift._id || nearAfter.workShift) === newWorkShiftId,
    'the closest unmatched ScheduledShift (1 min away) gets matched to the new WorkShift'
  );
  assert(!farAfter.workShift, 'a farther-but-in-tolerance ScheduledShift is left unmatched once a closer one is taken');
  assert(!tooFarAfter.workShift, 'a ScheduledShift outside the 36h tolerance is never matched');

  const comparisons = await req(`/scheduled-shifts/comparisons?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  const nearComparison = comparisons.data.find((c) => c.scheduledShift._id === near.data._id);
  const farComparison = comparisons.data.find((c) => c.scheduledShift._id === far.data._id);
  assert(nearComparison.comparison.matched === true, 'matched comparison reports matched=true');
  assert(nearComparison.comparison.status === 'OPEN', 'the newly started shift shows as OPEN in the comparison (not ended yet)');
  assert(farComparison.comparison.matched === false, 'the unmatched schedule reports matched=false');
  assert(farComparison.comparison.status === 'NOT_STARTED', 'an unmatched schedule reports status NOT_STARTED ("No inició turno")');

  await req('/work-shifts/end', { method: 'PATCH', token: driverToken, expectStatus: 200 });
  const comparisonsAfterEnd = await req(`/scheduled-shifts/comparisons?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  const nearComparisonClosed = comparisonsAfterEnd.data.find((c) => c.scheduledShift._id === near.data._id);
  assert(nearComparisonClosed.comparison.status === 'CLOSED', 'once the WorkShift ends, the comparison status becomes CLOSED');
  assert(
    typeof nearComparisonClosed.comparison.differenceMs === 'number',
    'a closed comparison always reports a numeric total difference — the manager never has to calculate it'
  );

  // Starting yet another shift must NOT re-match or steal the already-matched "near" schedule,
  // and must not touch the farther unmatched ones either unless they're actually the closest.
  await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  const scheduledListAfterThirdShift = await req(`/scheduled-shifts?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  const nearStill = scheduledListAfterThirdShift.data.find((s) => s._id === near.data._id);
  assert(
    (nearStill.workShift._id || nearStill.workShift) === newWorkShiftId,
    'a previously-matched ScheduledShift keeps pointing at its original WorkShift — never re-matched'
  );

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-accounting-periods:', err);
  process.exitCode = 1;
});
