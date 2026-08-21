// Phase 3 regression suite: replenishment suggestions (consumption calculation, config
// overrides, insufficient-history handling) and WEEKLY inventory counts (snapshot, discrepancy
// report, permissions).
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-replenishment.js  (or: npm run test:e2e:replenishment)

const { assert, req, assertServerReachable, resetAndSeed, findProductByName, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  assert(managerLogin.status === 200 && driverLogin.status === 200, 'manager and driver login succeed');

  const products = (await req('/products', { token: driverToken })).data;
  const agua = findProductByName(products, 'Agua 600ml');
  const refresco = findProductByName(products, 'Refresco');
  const papas = findProductByName(products, 'Papas fritas');
  const vehicle = (await req('/vehicles', { token: managerToken })).data[0];

  await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });

  // Runs one full session lifecycle (open -> sales -> closing -> finalize) and returns the
  // finalized session. `sales` is a list of { product, quantity, resolve } where resolve is
  // 'approve' | 'cancel' | 'incident' | 'leave-pending'.
  async function runSessionCycle({ initialStock, sales }) {
    const session = (
      await req('/inventory-sessions', { method: 'POST', token: managerToken, body: { vehicle: vehicle._id, initialStock }, expectStatus: 201 })
    ).data;

    for (const s of sales) {
      const sale = (
        await req('/sales', {
          method: 'POST',
          token: driverToken,
          body: {
            items: [{ product: s.product._id, quantity: s.quantity }],
            adjustment: { amount: 0, reason: '' },
            payments: [{ method: 'cash', amount: s.quantity * s.product.basePrice }],
          },
          expectStatus: 201,
        })
      ).data;

      if (s.resolve === 'approve') {
        await req(`/approvals/${sale._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
      } else if (s.resolve === 'cancel') {
        await req(`/approvals/${sale._id}/cancel`, { method: 'PATCH', token: managerToken, body: { reason: 'test cancel' }, expectStatus: 200 });
      } else if (s.resolve === 'incident') {
        await req(`/approvals/${sale._id}/mark-incident`, { method: 'PATCH', token: managerToken, body: { note: 'test incident' }, expectStatus: 200 });
      }
      // 'leave-pending' does nothing further.
    }

    const closing = (
      await req('/closings', {
        method: 'POST',
        token: driverToken,
        body: { counts: initialStock.map((s) => ({ product: s.product, quantityCounted: s.quantity })), reportedCash: 0 },
        expectStatus: 201,
      })
    ).data;

    await req(`/closings/${closing._id}/finalize`, { method: 'PATCH', token: managerToken, body: {}, expectStatus: 200 });

    return req(`/inventory-sessions/${session._id}`, { token: managerToken, expectStatus: 200 });
  }

  // --- Session 1: mixed sale statuses on Agua, to prove which ones count as consumption ---
  await runSessionCycle({
    initialStock: [
      { product: agua._id, quantity: 100 },
      { product: refresco._id, quantity: 100 },
      { product: papas._id, quantity: 100 },
    ],
    sales: [
      { product: agua, quantity: 10, resolve: 'approve' }, // counts
      { product: agua, quantity: 3, resolve: 'leave-pending' }, // counts (PENDING is inventory-affecting)
      { product: agua, quantity: 5, resolve: 'incident' }, // counts (INCIDENT is inventory-affecting)
      { product: agua, quantity: 7, resolve: 'cancel' }, // must NOT count
    ],
  });

  // --- After 1 CLOSED session: insufficient history (min is 3), but consumption is correct ---
  let suggestions = await req(`/replenishment?vehicle=${vehicle._id}`, { token: managerToken, expectStatus: 200 });
  assert(suggestions.data.sessionsUsed === 1, `sessionsUsed reflects 1 CLOSED session (got ${suggestions.data.sessionsUsed})`);
  assert(suggestions.data.insufficientHistory === true, 'insufficientHistory is true with only 1 session of data (min is 3)');

  let aguaRow = suggestions.data.rows.find((r) => r.product._id === agua._id);
  assert(aguaRow.totalConsumption === 18, `CANCELLED excluded, PENDING/APPROVED/INCIDENT included (got totalConsumption=${aguaRow.totalConsumption}, want 18 = 10+3+5)`);
  assert(aguaRow.averageDailyConsumption === 18, `averageDailyConsumption = totalConsumption / sessionsUsed (got ${aguaRow.averageDailyConsumption}, want 18)`);
  assert(aguaRow.suggestedReplenishment >= 0, 'suggestedReplenishment is never negative');

  // --- Sessions 2 and 3: simple 6-unit APPROVED Agua sale each, to reach the history threshold ---
  await runSessionCycle({
    initialStock: [{ product: agua._id, quantity: 50 }, { product: refresco._id, quantity: 50 }, { product: papas._id, quantity: 50 }],
    sales: [{ product: agua, quantity: 6, resolve: 'approve' }],
  });
  const session3 = await runSessionCycle({
    initialStock: [{ product: agua._id, quantity: 20 }, { product: refresco._id, quantity: 20 }, { product: papas._id, quantity: 20 }],
    sales: [{ product: agua, quantity: 6, resolve: 'approve' }],
  });
  assert(session3.data.status === 'CLOSED', 'third session cycle finalized to CLOSED');

  // --- After 3 CLOSED sessions: history is sufficient, and the numbers add up ---
  suggestions = await req(`/replenishment?vehicle=${vehicle._id}`, { token: managerToken, expectStatus: 200 });
  assert(suggestions.data.sessionsUsed === 3, `sessionsUsed now reflects 3 CLOSED sessions (got ${suggestions.data.sessionsUsed})`);
  assert(suggestions.data.insufficientHistory === false, 'insufficientHistory is false once the minimum history threshold is met');
  assert(suggestions.data.stockSource === 'LAST_CLOSED_SESSION', `currentStock is drawn from the latest reliable state (got source=${suggestions.data.stockSource})`);

  aguaRow = suggestions.data.rows.find((r) => r.product._id === agua._id);
  assert(aguaRow.totalConsumption === 30, `total consumption across 3 sessions (got ${aguaRow.totalConsumption}, want 30 = 18+6+6)`);
  assert(aguaRow.averageDailyConsumption === 10, `averageDailyConsumption = 30/3 (got ${aguaRow.averageDailyConsumption}, want 10)`);
  assert(aguaRow.currentStock === 14, `currentStock is session 3's final expected inventory: 20 initial - 6 sold (got ${aguaRow.currentStock}, want 14)`);
  assert(aguaRow.coverageDays === 3 && aguaRow.safetyStock === 0, 'default coverageDays/safetyStock applied with no override');
  assert(aguaRow.targetStock === 30, `target = avgDaily(10) * coverageDays(3) + safetyStock(0) (got ${aguaRow.targetStock}, want 30)`);
  assert(aguaRow.suggestedReplenishment === 16, `suggested = target(30) - currentStock(14) (got ${aguaRow.suggestedReplenishment}, want 16)`);

  // A product that was never sold has 0 consumption, never invented, and a target driven only
  // by safety stock (0 by default here) — so suggested should just be max(0, 0 - currentStock).
  const papasRow = suggestions.data.rows.find((r) => r.product._id === papas._id);
  assert(papasRow.totalConsumption === 0, 'a product with no sales has 0 consumption, not invented demand');
  assert(papasRow.suggestedReplenishment === 0, 'no demand and existing stock -> nothing suggested');

  // --- Config overrides change the suggestion; DELETE resets to default ---
  const overrideSet = await req(`/replenishment/config/${agua._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { coverageDays: 1, safetyStock: 5 },
    expectStatus: 200,
  });
  assert(overrideSet.data.coverageDays === 1 && overrideSet.data.safetyStock === 5, 'config override saved');

  suggestions = await req(`/replenishment?vehicle=${vehicle._id}`, { token: managerToken });
  aguaRow = suggestions.data.rows.find((r) => r.product._id === agua._id);
  assert(aguaRow.configIsOverride === true, 'row reflects that this product has a config override');
  assert(aguaRow.targetStock === 15, `target with override = 10*1 + 5 (got ${aguaRow.targetStock}, want 15)`);
  assert(aguaRow.suggestedReplenishment === 1, `suggested with override = 15 - 14 (got ${aguaRow.suggestedReplenishment}, want 1)`);

  const configList = await req('/replenishment/config', { token: managerToken, expectStatus: 200 });
  const aguaConfig = configList.data.find((c) => c.product._id === agua._id);
  assert(aguaConfig.isOverride === true, 'config list reflects the override');

  await req(`/replenishment/config/${agua._id}`, { method: 'DELETE', token: managerToken, expectStatus: 204 });
  suggestions = await req(`/replenishment?vehicle=${vehicle._id}`, { token: managerToken });
  aguaRow = suggestions.data.rows.find((r) => r.product._id === agua._id);
  assert(aguaRow.configIsOverride === false, 'config override removed, row reflects defaults again');
  assert(aguaRow.targetStock === 30, 'target back to the default-derived value after reset');

  // --- Permissions: driver has no replenishment access at all ---
  await req(`/replenishment?vehicle=${vehicle._id}`, { token: driverToken, expectStatus: 403 });
  await req('/replenishment/config', { token: driverToken, expectStatus: 403 });
  await req(`/replenishment/config/${agua._id}`, { method: 'PUT', token: driverToken, body: { coverageDays: 1, safetyStock: 1 }, expectStatus: 403 });

  // --- WEEKLY inventory count ---
  const expectedBeforeWeekly = await req(`/inventory-sessions/${session3.data._id}/expected`, { token: managerToken, expectStatus: 200 });
  const aguaExpectedBefore = expectedBeforeWeekly.data.find((e) => e.product._id === agua._id).quantityExpected;
  assert(aguaExpectedBefore === 14, 'sanity check: session 3 expected inventory for Agua is 14 before the weekly count');

  // Driver has no WEEKLY permission in this phase.
  await req('/inventory-counts/weekly', {
    method: 'POST',
    token: driverToken,
    body: { vehicle: vehicle._id, counts: [{ product: agua._id, quantityCounted: 12 }] },
    expectStatus: 403,
  });
  await req('/inventory-counts/weekly', { token: driverToken, expectStatus: 403 });

  const weekOf = new Date().toISOString();
  const weekly = await req('/inventory-counts/weekly', {
    method: 'POST',
    token: managerToken,
    body: {
      vehicle: vehicle._id,
      weekOf,
      counts: [
        { product: agua._id, quantityCounted: 12 },
        { product: refresco._id, quantityCounted: 20 },
        { product: papas._id, quantityCounted: 20 },
      ],
    },
    expectStatus: 201,
  });
  assert(weekly.data.type === 'WEEKLY', 'weekly count created with type WEEKLY');

  const aguaExpectedSnapshot = weekly.data.expectedAtCountTime.find((e) => (e.product._id || e.product) === agua._id);
  assert(
    aguaExpectedSnapshot.quantityExpected === 14,
    `weekly count stores an expectedAtCountTime snapshot from current stock (got ${aguaExpectedSnapshot.quantityExpected}, want 14)`
  );

  const aguaDiff = weekly.data.differences.find((d) => d.product._id === agua._id);
  assert(aguaDiff.difference === -2, `weekly discrepancy computed correctly (counted 12 - expected 14 = -2, got ${aguaDiff.difference})`);
  assert(
    Math.abs(aguaDiff.differencePercentage - -14.29) < 0.1,
    `difference percentage computed where meaningful (got ${aguaDiff.differencePercentage}, want ~-14.29)`
  );

  // Weekly count must never overwrite the expected inventory it snapshotted from.
  const expectedAfterWeekly = await req(`/inventory-sessions/${session3.data._id}/expected`, { token: managerToken, expectStatus: 200 });
  const aguaExpectedAfter = expectedAfterWeekly.data.find((e) => e.product._id === agua._id).quantityExpected;
  assert(aguaExpectedAfter === 14, 'expected inventory is unchanged after the weekly count — never overwritten');

  // --- Weekly discrepancy report ---
  const report = await req(`/inventory-counts/weekly?vehicle=${vehicle._id}`, { token: managerToken, expectStatus: 200 });
  assert(report.data.length === 1, 'weekly report lists the weekly count, filtered by vehicle');
  assert(typeof report.data[0].week === 'string' && /^\d{4}-W\d{2}$/.test(report.data[0].week), 'each entry carries a derived week label for grouping');
  assert(report.data[0].vehicle._id === vehicle._id, 'report entry identifies the vehicle');

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-replenishment:', err);
  process.exitCode = 1;
});
