// Phase 2 regression suite: vehicle/session prerequisites, sale-status effects on expected
// inventory (PENDING/APPROVED/CANCELLED/INCIDENT), partial counts, cash reconciliation on
// closing, and role permissions.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
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

  // --- WorkShift must be OPEN before a session/sale can proceed ---
  const shiftStart = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  assert(shiftStart.data.status === 'OPEN', 'driver work shift started for this regression run');

  // --- Driver cannot create sale before a session is open ---
  const productsRes = await req('/products', { token: driverToken });
  const products = productsRes.data;
  assert(products.length === 3, 'seeded 3 products present');

  // Selected by stable name, not array position: Product.create() inserts all three seed
  // products in the same millisecond, so GET /products (sorted by createdAt desc) does not
  // reliably come back in insertion order.
  const agua = findProductByName(products, 'Agua 600ml');
  const refresco = findProductByName(products, 'Refresco');
  const papas = findProductByName(products, 'Papas fritas');

  const saleBeforeSession = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: agua._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: agua.basePrice }],
    },
  });
  assert(saleBeforeSession.status === 400, 'sale creation blocked with no open session');

  // --- Driver cannot open a session ---
  const vehiclesRes = await req('/vehicles', { token: managerToken });
  assert(vehiclesRes.status === 200 && vehiclesRes.data.length === 1, 'manager can list vehicles, 1 seeded');
  const vehicle = vehiclesRes.data[0];
  assert(!!vehicle.assignedDriver, 'vehicle has an assigned driver');

  const driverTriesOpenSession = await req('/inventory-sessions', {
    method: 'POST',
    token: driverToken,
    body: { vehicle: vehicle._id, initialStock: [{ product: agua._id, quantity: 100 }] },
  });
  assert(driverTriesOpenSession.status === 403, 'driver forbidden from opening a session');

  // --- Manager opens InventorySession with initial stock ---
  const initialStock = [
    { product: agua._id, quantity: 50 },
    { product: refresco._id, quantity: 30 },
    { product: papas._id, quantity: 20 },
  ];
  const openSession = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { vehicle: vehicle._id, initialStock },
    expectStatus: 201,
  });
  const session = openSession.data;
  assert(session.status === 'OPEN', 'session opened with status OPEN');
  assert(session.initialStock.length === 3, 'initial stock has 3 products');

  // --- Only one active session per vehicle ---
  await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { vehicle: vehicle._id, initialStock },
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
  const sale3 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: papas._id, quantity: 2 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: 2 * papas.basePrice }],
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
  // expectedCash should be APPROVED cash payments only: sale1 (cash, 5*15=75) is APPROVED.
  // sale3 is INCIDENT (excluded), sale2 is CANCELLED (excluded).
  const closingCounts = [
    { product: agua._id, quantityCounted: 44 },
    { product: refresco._id, quantityCounted: 30 },
    { product: papas._id, quantityCounted: 18 },
  ];
  const reportedCash = 80; // expectedCash = 75, so cashDifference should be +5
  const closing = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: closingCounts, reportedCash },
    expectStatus: 201,
  });
  assert(closing.data.expectedCash === 75, `expectedCash uses APPROVED cash payments only (got ${closing.data.expectedCash}, want 75)`);
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

  // --- Driver cannot create another sale against the CLOSED session ---
  await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: agua._id, quantity: 1 }],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: agua.basePrice }],
    },
    expectStatus: 400,
  });

  // --- Driver cannot create a partial count after session closed ---
  await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: partialCounts },
    expectStatus: 400,
  });

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
    body: { vehicle: vehicle._id, initialStock: products.map((p) => ({ product: p._id, quantity: 10 })) },
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
