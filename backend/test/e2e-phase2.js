// Phase 2 regression suite: driver-owned inventory sessions, sale-status effects on expected
// inventory (PENDING/APPROVED/CANCELLED/INCIDENT), partial counts, cash reconciliation on
// closing, and role permissions.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-phase2.js  (or: npm run test:e2e:phase2)

const { assert, req, assertServerReachable, resetAndSeed, findProductByName, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  // --- Login ---
  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  assert(managerLogin.status === 200, 'manager login succeeds');
  const managerToken = managerLogin.data.token;

  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  assert(driverLogin.status === 200, 'driver login succeeds');
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;

  // --- WorkShift must be OPEN before a sale can proceed ---
  const shiftStart = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  assert(shiftStart.data.status === 'OPEN', 'driver work shift started for this regression run');

  const productsRes = await req('/products', { token: driverToken });
  const products = productsRes.data;
  assert(products.length === 10, 'seeded 10 products present');

  // Selected by stable name, not array position: Product.create() inserts all seed products
  // in the same millisecond, so GET /products (sorted by order/createdAt) is checked by name.
  const agua = findProductByName(products, 'Perro');
  const refresco = findProductByName(products, 'Ratón');
  const papas = findProductByName(products, 'Grillo');

  // --- Inventory belongs to the driver, not a vehicle: a driver can sell with an active shift
  // and no inventory session at all. Selling silently creates one (carrying forward whatever
  // the driver currently has — nothing yet, for a brand-new driver), so tracking stays
  // continuous instead of the sale floating unattached. ---
  const saleNoSession = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: agua._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: agua.basePrice }],
    },
    expectStatus: 201,
  });
  assert(saleNoSession.data.status === 'PENDING', 'driver can sell with no inventory session pre-existing');
  assert(!!saleNoSession.data.inventorySession, 'selling silently opens a session so tracking stays continuous');
  const autoSessionId = saleNoSession.data.inventorySession._id;

  // --- Driver cannot open a session ---
  const vehiclesRes = await req('/vehicles', { token: managerToken });
  assert(vehiclesRes.status === 200 && vehiclesRes.data.length === 1, 'manager can list vehicles, 1 seeded');
  const vehicle = vehiclesRes.data[0];
  assert(!!vehicle.assignedDriver, 'vehicle has an assigned driver');

  const driverTriesOpenSession = await req('/inventory-sessions', {
    method: 'POST',
    token: driverToken,
    body: { driver: driverId, initialStock: [{ product: agua._id, quantity: 100 }] },
  });
  assert(driverTriesOpenSession.status === 403, 'driver forbidden from opening a session');

  // --- Manager stocks the driver up via Reponer (replenish) — the everyday path now, not a
  // manual "open a session with initial stock" step. A session already exists (auto-created by
  // the sale above), so this adds to it: agua gets +51 to net out at exactly 50 after the -1
  // from that earlier sale, keeping every downstream number in this file identical to before. ---
  const initialStock = [
    { product: agua._id, quantity: 50 },
    { product: refresco._id, quantity: 30 },
    { product: papas._id, quantity: 20 },
  ];
  const replenish1 = await req('/inventory-sessions/replenish', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      items: [
        { product: agua._id, quantity: 51 },
        { product: refresco._id, quantity: 30 },
        { product: papas._id, quantity: 20 },
      ],
    },
    expectStatus: 201,
  });
  const aguaAfterReplenish = replenish1.data.stock.find((s) => s.product._id === agua._id);
  assert(aguaAfterReplenish.quantityExpected === 50, `replenish nets out to 50 agua after the earlier -1 sale (got ${aguaAfterReplenish.quantityExpected})`);

  const openSession = await req(`/inventory-sessions/${autoSessionId}`, { token: managerToken, expectStatus: 200 });
  const session = openSession.data;
  assert(session.status === 'OPEN', 'session opened with status OPEN');
  assert(session.driver._id === driverId, 'session is owned by the driver');
  assert(session.vehicle?.name === vehicle.name, 'session keeps the current vehicle only as an informational snapshot');
  assert(session.initialStock.length === 3, 'initial stock has 3 products');

  // --- Only one active session per driver (not per vehicle) ---
  await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock },
    expectStatus: 400,
  });

  // --- Driver views active session ---
  const activeSession = await req('/inventory-sessions/active/mine', { token: driverToken, expectStatus: 200 });
  assert(activeSession.data._id === session._id, 'driver active session matches opened session');

  // --- Driver creates a sale (PENDING) ---
  const sale1 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: agua._id, quantity: 5 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: 5 * agua.basePrice }],
    },
    expectStatus: 201,
  });
  assert(sale1.data.status === 'PENDING', 'sale1 created PENDING');
  assert(sale1.data.vehicle._id === vehicle._id, 'sale1 vehicle resolved server-side matches assigned vehicle');
  assert(sale1.data.inventorySession._id === session._id, 'sale1 attached to open session');

  // --- Expected inventory reduced by PENDING sale ---
  let expected = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken, expectStatus: 200 });
  let aguaExpected = expected.data.find((e) => e.product._id === agua._id);
  assert(aguaExpected.quantityExpected === 45, `PENDING sale reduces expected inventory (got ${aguaExpected.quantityExpected}, want 45)`);

  // --- Manager approves sale1 ---
  const approve1 = await req(`/approvals/${sale1.data._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(approve1.data.status === 'APPROVED', 'sale1 approved');

  // --- Create sale2, then CANCEL it ---
  const sale2 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: refresco._id, quantity: 3 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'transfer', amount: 3 * refresco.basePrice }],
    },
    expectStatus: 201,
  });

  expected = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken });
  let refrescoExpected = expected.data.find((e) => e.product._id === refresco._id);
  assert(refrescoExpected.quantityExpected === 27, `sale2 PENDING reduces refresco expected to 27 (got ${refrescoExpected.quantityExpected})`);

  const cancel2 = await req(`/approvals/${sale2.data._id}/cancel`, {
    method: 'PATCH',
    token: managerToken,
    body: { reason: 'Cliente devolvió el producto' },
    expectStatus: 200,
  });
  assert(cancel2.data.status === 'CANCELLED', 'sale2 cancelled');

  expected = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken });
  refrescoExpected = expected.data.find((e) => e.product._id === refresco._id);
  assert(refrescoExpected.quantityExpected === 30, `CANCELLED sale no longer reduces expected inventory (got ${refrescoExpected.quantityExpected}, want 30)`);

  // --- Create sale3, then mark INCIDENT ---
  // Grillo has an active QUANTITY_FOR_PRICE promotion in seed data (2 for $50), so 2 units
  // costs the bundle price, not 2 * basePrice — this test is about inventory effects, not
  // pricing, but the payment amount still has to match what the server actually computes.
  const sale3 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: papas._id, quantity: 2 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: 50 }],
    },
    expectStatus: 201,
  });

  const incident3 = await req(`/approvals/${sale3.data._id}/mark-incident`, {
    method: 'PATCH',
    token: managerToken,
    body: { note: 'Discrepancia detectada' },
    expectStatus: 200,
  });
  assert(incident3.data.status === 'INCIDENT', 'sale3 marked as INCIDENT');

  expected = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken });
  let papasExpected = expected.data.find((e) => e.product._id === papas._id);
  assert(papasExpected.quantityExpected === 18, `INCIDENT sale still reduces expected inventory (got ${papasExpected.quantityExpected}, want 18)`);

  // --- Driver creates a PARTIAL count ---
  const partialCounts = [
    { product: agua._id, quantityCounted: 44 }, // expected 45 -> diff -1
    { product: refresco._id, quantityCounted: 30 }, // expected 30 -> diff 0
    { product: papas._id, quantityCounted: 18 }, // expected 18 -> diff 0
  ];
  const partial = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: partialCounts },
    expectStatus: 201,
  });
  assert(partial.data.type === 'PARTIAL', 'partial count created with type PARTIAL');
  const aguaDiff = partial.data.differences.find((d) => d.product._id === agua._id);
  assert(aguaDiff.difference === -1, `partial count difference computed correctly (got ${aguaDiff.difference}, want -1)`);

  // --- Manager cannot create partial count (role check) ---
  await req('/inventory-counts/partial', {
    method: 'POST',
    token: managerToken,
    body: { counts: partialCounts },
    expectStatus: 403,
  });

  // --- Driver creates CLOSING count + reports cash ---
  // expectedCash should be APPROVED cash payments only: sale1 (cash, 5*45=225) is APPROVED.
  // sale3 is INCIDENT (excluded), sale2 is CANCELLED (excluded).
  const closingCounts = [
    { product: agua._id, quantityCounted: 44 },
    { product: refresco._id, quantityCounted: 30 },
    { product: papas._id, quantityCounted: 18 },
  ];
  const reportedCash = 230; // expectedCash = 225, so cashDifference should be +5
  const closing = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: closingCounts, reportedCash },
    expectStatus: 201,
  });
  assert(closing.data.expectedCash === 225, `expectedCash uses APPROVED cash payments only (got ${closing.data.expectedCash}, want 225)`);
  assert(closing.data.cashDifference === 5, `cashDifference computed correctly (got ${closing.data.cashDifference}, want 5)`);
  assert(closing.data.status === 'OPEN', 'closing created with status OPEN, pending manager finalize');

  // --- Driver cannot finalize closing ---
  await req(`/closings/${closing.data._id}/finalize`, { method: 'PATCH', token: driverToken, expectStatus: 403 });

  // --- Manager finalizes closing ---
  const finalized = await req(`/closings/${closing.data._id}/finalize`, {
    method: 'PATCH',
    token: managerToken,
    body: { note: 'Todo revisado, diferencia menor aceptada' },
    expectStatus: 200,
  });
  assert(finalized.data.status === 'CLOSED', 'closing finalized -> CLOSED');

  // --- Session should now be CLOSED ---
  const sessionAfterClose = await req(`/inventory-sessions/${session._id}`, { token: managerToken, expectStatus: 200 });
  assert(sessionAfterClose.data.status === 'CLOSED', 'session status CLOSED after finalize');
  assert(!!sessionAfterClose.data.endedAt, 'session endedAt set after finalize');

  // --- Driver can still sell after the session is CLOSED — selling never depends on an
  // inventory session existing. Selling silently opens a new session, carrying the driver's
  // stock forward from the one that just closed (45 - the 1 unit sold here = 44). ---
  const saleAfterSessionClosed = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: agua._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: agua.basePrice }],
    },
    expectStatus: 201,
  });
  assert(!!saleAfterSessionClosed.data.inventorySession, 'sale after the session closed silently opens a new one');
  assert(
    saleAfterSessionClosed.data.inventorySession._id !== session._id,
    'the new session is a different one from the closed session'
  );
  const autoSession2Id = saleAfterSessionClosed.data.inventorySession._id;

  const expectedAfterAutoOpen = await req(`/inventory-sessions/${autoSession2Id}/expected`, { token: managerToken, expectStatus: 200 });
  const aguaExpectedAfterAutoOpen = expectedAfterAutoOpen.data.find((e) => e.product._id === agua._id);
  assert(
    aguaExpectedAfterAutoOpen.quantityExpected === 44,
    `new session carries the driver's stock forward from the closed one (45 - 1 = 44, got ${aguaExpectedAfterAutoOpen.quantityExpected})`
  );

  // --- Inventory tracking stayed continuous, so a partial count against this new session
  // succeeds right away — no "open a session first" step for anyone. ---
  const partialAfterAutoOpen = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: agua._id, quantityCounted: 44 }, { product: refresco._id, quantityCounted: 30 }, { product: papas._id, quantityCounted: 18 }] },
    expectStatus: 201,
  });
  assert(partialAfterAutoOpen.data.type === 'PARTIAL', 'partial count succeeds against the auto-opened session');

  // Fully close this auto-opened session out before the "supplementary" section below, so it
  // starts from the same clean slate (no active session) it originally assumed.
  const closingAfterAutoOpen = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: {
      counts: [{ product: agua._id, quantityCounted: 44 }, { product: refresco._id, quantityCounted: 30 }, { product: papas._id, quantityCounted: 18 }],
      reportedCash: 0,
    },
    expectStatus: 201,
  });
  await req(`/closings/${closingAfterAutoOpen.data._id}/finalize`, {
    method: 'PATCH',
    token: managerToken,
    body: { note: '' },
    expectStatus: 200,
  });
  const autoSession2AfterClose = await req(`/inventory-sessions/${autoSession2Id}`, { token: managerToken, expectStatus: 200 });
  assert(autoSession2AfterClose.data.status === 'CLOSED', 'auto-opened session closed out cleanly before the supplementary checks below');

  // --- Role permission checks ---
  await req('/inventory-sessions', { token: driverToken, expectStatus: 403 });
  await req('/closings', { token: driverToken, expectStatus: 403 });
  await req('/closings', {
    method: 'POST',
    token: managerToken,
    body: { counts: closingCounts, reportedCash: 10 },
    expectStatus: 403,
  });

  // --- Supplementary: /vehicles/mine, initial stock updates, count history, audit trail ---
  // (The driver's shift from earlier in this run is still OPEN, so a second session can be
  // opened once the first is CLOSED.)
  const mine = await req('/vehicles/mine', { token: driverToken, expectStatus: 200 });
  assert(!!mine.data._id, 'driver can fetch own assigned vehicle via /vehicles/mine');
  await req('/vehicles/mine', { token: managerToken, expectStatus: 403 });

  const secondSession = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock: products.map((p) => ({ product: p._id, quantity: 10 })) },
    expectStatus: 201,
  });
  const session2 = secondSession.data;

  const updatedStock = await req(`/inventory-sessions/${session2._id}/initial-stock`, {
    method: 'PATCH',
    token: managerToken,
    body: { initialStock: products.map((p) => ({ product: p._id, quantity: 15 })) },
    expectStatus: 200,
  });
  assert(updatedStock.data.initialStock.every((s) => s.quantity === 15), 'initial stock updated by manager');

  await req(`/inventory-sessions/${session2._id}/initial-stock`, {
    method: 'PATCH',
    token: driverToken,
    body: { initialStock: products.map((p) => ({ product: p._id, quantity: 999 })) },
    expectStatus: 403,
  });

  const counts2 = await req(`/inventory-counts?session=${session2._id}`, { token: managerToken, expectStatus: 200 });
  assert(
    counts2.data.length === 1 && counts2.data[0].type === 'INITIAL',
    'new session has exactly 1 INITIAL count so far'
  );

  const auditRes = await req(`/audit?entity=InventorySession&entityId=${session2._id}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditRes.data.some((a) => a.action === 'UPDATE'),
    'initial stock change by manager is audited as UPDATE'
  );

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-phase2:', err);
  process.exitCode = 1;
});
