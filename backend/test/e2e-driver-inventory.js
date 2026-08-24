// Driver-owned inventory regression suite: inventory belongs to the driver, never the vehicle.
// Covers the core rule from the inventory-architecture refactor:
//   - a driver can sell with no inventory session at all
//   - a sale updates the driver's expected inventory (not a vehicle's)
//   - counts reconcile the driver's inventory
//   - switching a driver to a different vehicle never resets, closes, transfers, or otherwise
//     touches their inventory session/expected stock
//   - historical sales keep the vehicle snapshot they were created with, even after reassignment
//   - replenishment keeps working, keyed by driver, through a vehicle change
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-driver-inventory.js  (or: npm run test:e2e:driver-inventory)

const { assert, req, assertServerReachable, resetAndSeed, findProductByName, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;

  const products = (await req('/products', { token: driverToken })).data;
  const perro = findProductByName(products, 'Perro');
  const raton = findProductByName(products, 'Ratón');

  await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });

  const vehicleA = (await req('/vehicles/mine', { token: driverToken, expectStatus: 200 })).data;

  // --- Driver can sell with an active shift and no inventory session at all — selling
  // silently opens one (carrying forward whatever the driver currently has: nothing yet). ---
  const saleNoSession = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: perro._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: perro.basePrice }] },
    expectStatus: 201,
  });
  assert(saleNoSession.data.status === 'PENDING', 'driver can sell without any inventory session (only an active shift is required)');
  assert(saleNoSession.data.vehicle._id === vehicleA._id, 'the sale still records the vehicle in use, purely as history — never as an inventory owner');
  assert(!!saleNoSession.data.inventorySession, 'selling silently opens a driver-owned session so tracking stays continuous');
  const autoSessionId = saleNoSession.data.inventorySession._id;

  // --- Manager stocks the driver up via Reponer (replenish) — adds to the session that was
  // just auto-opened. Perro gets +41 to net out at exactly 40 after the -1 from the sale above. ---
  const replenish = await req('/inventory-sessions/replenish', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, items: [{ product: perro._id, quantity: 41 }, { product: raton._id, quantity: 20 }] },
    expectStatus: 201,
  });
  const perroAfterReplenish = replenish.data.stock.find((s) => s.product._id === perro._id).quantityExpected;
  assert(perroAfterReplenish === 40, `replenish nets out to 40 perro after the earlier -1 sale (got ${perroAfterReplenish})`);

  const openSession = await req(`/inventory-sessions/${autoSessionId}`, { token: managerToken, expectStatus: 200 });
  const session = openSession.data;
  assert(session.driver._id === driverId, 'session is owned by the driver');

  // --- A sale updates the driver's expected inventory ---
  const sale1 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: perro._id, quantity: 5 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: 5 * perro.basePrice }] },
    expectStatus: 201,
  });
  assert(sale1.data.inventorySession._id === session._id, 'sale attaches to the driver active session');

  let expected = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken, expectStatus: 200 });
  let perroExpected = expected.data.find((e) => e.product._id === perro._id).quantityExpected;
  assert(perroExpected === 35, `sale reduced the driver's expected Perro stock to 35 (got ${perroExpected})`);

  // ============================================================================
  // Core rule: switching the driver to a different vehicle must never touch inventory
  // ============================================================================

  const vehicleB = (await req('/vehicles', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Carrito 2 (repuesto)', active: true },
    expectStatus: 201,
  })).data;

  // Simulate "Vehicle A breaks down, driver switches to Vehicle B": unassign A, assign B.
  await req(`/vehicles/${vehicleA._id}`, { method: 'PUT', token: managerToken, body: { assignedDriver: null }, expectStatus: 200 });
  await req(`/vehicles/${vehicleB._id}`, { method: 'PUT', token: managerToken, body: { assignedDriver: driverId }, expectStatus: 200 });

  const vehicleAfterSwitch = (await req('/vehicles/mine', { token: driverToken, expectStatus: 200 })).data;
  assert(vehicleAfterSwitch._id === vehicleB._id, 'driver is now assigned to vehicle B');

  const sessionAfterSwitch = await req('/inventory-sessions/active/mine', { token: driverToken, expectStatus: 200 });
  assert(sessionAfterSwitch.data._id === session._id, 'the exact same inventory session is still active after switching vehicles — not reset, closed, or recreated');
  assert(sessionAfterSwitch.data.status === 'OPEN', 'session status is unaffected by the vehicle switch');

  const expectedAfterSwitch = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken, expectStatus: 200 });
  const perroExpectedAfterSwitch = expectedAfterSwitch.data.find((e) => e.product._id === perro._id).quantityExpected;
  const ratonExpectedAfterSwitch = expectedAfterSwitch.data.find((e) => e.product._id === raton._id).quantityExpected;
  assert(perroExpectedAfterSwitch === 35, `expected Perro stock is unchanged by the vehicle switch (got ${perroExpectedAfterSwitch}, want 35)`);
  assert(ratonExpectedAfterSwitch === 20, `expected Ratón stock is unchanged by the vehicle switch (got ${ratonExpectedAfterSwitch}, want 20)`);

  // Historical sale keeps the vehicle it actually happened under — reassignment never rewrites
  // history.
  const sale1AfterSwitch = await req(`/sales/${sale1.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(sale1AfterSwitch.data.vehicle._id === vehicleA._id, "a sale made before the switch still shows vehicle A — history isn't rewritten");

  // --- Driver keeps selling against the SAME session after the vehicle switch ---
  const sale2 = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: raton._id, quantity: 4 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'transfer', amount: 4 * raton.basePrice }] },
    expectStatus: 201,
  });
  assert(sale2.data.inventorySession._id === session._id, 'a sale made after switching vehicles still attaches to the same pre-existing session');
  assert(sale2.data.vehicle._id === vehicleB._id, 'the new sale correctly records vehicle B as the vehicle in use, purely as history');

  const expectedAfterSale2 = await req(`/inventory-sessions/${session._id}/expected`, { token: managerToken, expectStatus: 200 });
  const ratonExpectedAfterSale2 = expectedAfterSale2.data.find((e) => e.product._id === raton._id).quantityExpected;
  assert(ratonExpectedAfterSale2 === 16, `expected Ratón stock correctly reduced by the post-switch sale (got ${ratonExpectedAfterSale2}, want 16)`);

  // --- Counts reconcile the driver's inventory, unaffected by which vehicle they're on ---
  const partial = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: perro._id, quantityCounted: 34 }, { product: raton._id, quantityCounted: 16 }] },
    expectStatus: 201,
  });
  const perroDiff = partial.data.differences.find((d) => d.product._id === perro._id);
  assert(perroDiff.difference === -1, `partial count still reconciles correctly against driver inventory after the vehicle switch (got ${perroDiff.difference}, want -1)`);

  // --- Replenishment stays keyed by driver, unaffected by vehicle history ---
  const closing = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: perro._id, quantityCounted: 34 }, { product: raton._id, quantityCounted: 16 }], reportedCash: 0 },
    expectStatus: 201,
  });
  await req(`/closings/${closing.data._id}/finalize`, { method: 'PATCH', token: managerToken, body: {}, expectStatus: 200 });

  const suggestions = await req(`/replenishment?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  assert(suggestions.data.sessionsUsed === 1, 'replenishment sees the CLOSED session regardless of which vehicle it happened under');
  // Note: saleNoSession (1 unit) silently opened this same session, so it's attached too —
  // total consumption is saleNoSession's 1 + sale1's 5 = 6.
  const perroRow = suggestions.data.rows.find((r) => r.product._id === perro._id);
  assert(perroRow.totalConsumption === 6, `replenishment consumption reflects every sale attached to the session (got ${perroRow.totalConsumption}, want 6)`);
  assert(perroRow.currentStock === 35, `replenishment current stock is the formula-derived expected stock, never overwritten by the physical count (got ${perroRow.currentStock}, want 35 = 41 initial - 1 - 5 sold)`);

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-driver-inventory:', err);
  process.exitCode = 1;
});
