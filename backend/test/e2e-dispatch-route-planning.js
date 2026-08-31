// Focused regression suite for the "Route Planning Foundation" checkpoint: manager-driven,
// server-authoritative route reordering (PATCH /dispatch/route-order), the per-driver route
// summary read model (GET /dispatch/route-summary), destination normalization
// (originalAddress/coordinateSource), and the deterministic multi-stop "Abrir ruta en mapas" link.
// Does not re-test assignment/address-correction/mapsUrl-freshness — see e2e-dispatch-map.js for
// that coverage; this suite starts from already-assigned dispatches.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-dispatch-route-planning.js (or: npm run test:e2e:dispatch-route-planning)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;

  const driver1Login = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driver1Token = driver1Login.data.token;
  const driver1Id = driver1Login.data.user.id;

  const driver2 = await createExtraUser({ name: 'Driver Two', email: 'driver2@delivery.test', role: 'driver' });

  async function auditActions(entity, entityId) {
    const res = await req(`/audit?entity=${entity}&entityId=${entityId}`, { token: managerToken, expectStatus: 200 });
    return res.data;
  }

  async function createAssigned(driverId, address, extra = {}) {
    const res = await req('/dispatch', { method: 'POST', token: managerToken, body: { driver: driverId, address, ...extra }, expectStatus: 201 });
    return res.data;
  }

  // =========================================================================
  // DESTINATION NORMALIZATION
  // =========================================================================

  const created = await createAssigned(driver1Id, 'Av. Central 1');
  assert(created.originalAddress === 'Av. Central 1', 'a newly created dispatch captures originalAddress at creation');
  assert(created.coordinateSource === 'NONE', 'coordinateSource is NONE when no coordinates were supplied');

  const withCoords = await createAssigned(driver1Id, 'Av. Central 2', { latitude: 19.1, longitude: -99.1 });
  assert(withCoords.coordinateSource === 'MANUAL', 'coordinateSource is MANUAL when coordinates are supplied');

  const corrected = await req(`/dispatch/${created._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: 'Av. Central 1 corregida' }, expectStatus: 200 });
  assert(corrected.data.originalAddress === 'Av. Central 1', 'originalAddress is preserved unchanged across a destination correction');
  assert(corrected.data.address === 'Av. Central 1 corregida', 'address (the current/display value) reflects the correction');

  // =========================================================================
  // ROUTE SUMMARY — honest counts, no fabricated distance/time
  // =========================================================================

  const summary1 = await req(`/dispatch/route-summary?driver=${driver1Id}`, { token: managerToken, expectStatus: 200 });
  assert(summary1.data.driver._id === driver1Id, 'route summary identifies the correct driver');
  assert(summary1.data.stopCount === 2, 'route summary counts exactly the active (PENDING/ACCEPTED) stops');
  assert(summary1.data.withCoordinatesCount === 1 && summary1.data.missingCoordinatesCount === 1, 'route summary honestly counts stops with/without coordinates');
  assert(!('estimatedDistanceMeters' in summary1.data) && !('estimatedDurationSeconds' in summary1.data), 'route summary never fabricates distance/time — no routing engine exists yet');
  assert(typeof summary1.data.routeMapsUrl === 'string' && summary1.data.routeMapsUrl.startsWith('https://www.google.com/maps/dir/'), 'route summary includes a deterministic multi-stop maps link');

  await req(`/dispatch/route-summary?driver=${driver1Id}`, { token: driver1Token, expectStatus: 403 });
  await req('/dispatch/route-summary', { token: managerToken, expectStatus: 400 });

  // =========================================================================
  // REORDER — valid case
  // =========================================================================

  const stopIdsInSummaryOrder = summary1.data.stops.map((s) => s._id);
  const reversedOrder = [...stopIdsInSummaryOrder].reverse();

  const reordered = await req('/dispatch/route-order', { method: 'PATCH', token: managerToken, body: { driver: driver1Id, orderedIds: reversedOrder }, expectStatus: 200 });
  assert(
    reordered.data.stops.map((s) => s._id).join(',') === reversedOrder.join(','),
    'a valid reorder is applied in exactly the submitted order'
  );
  assert(
    reordered.data.stops[0].routeOrder === 1 && reordered.data.stops[1].routeOrder === 2,
    'route order remains contiguous (1, 2, ...) after reordering'
  );

  const routeAudit = await auditActions('DispatchRoute', driver1Id);
  const reorderEvents = routeAudit.filter((e) => e.action === 'DISPATCH_ROUTE_REORDERED');
  assert(reorderEvents.length === 1, 'a valid reorder writes exactly one DISPATCH_ROUTE_REORDERED audit event, not one per stop');
  assert(
    Array.isArray(reorderEvents[0].changes[0].oldValue) && Array.isArray(reorderEvents[0].changes[0].newValue),
    'the audit event records both the previous and new order'
  );
  assert(reorderEvents[0].changes[0].newValue.join(',') === reversedOrder.join(','), 'the audit event records the exact new order applied');

  // =========================================================================
  // REORDER — rejected cases, each verified to cause NO partial mutation
  // =========================================================================

  async function currentOrder(driverId) {
    const s = await req(`/dispatch/route-summary?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
    return s.data.stops.map((st) => st._id);
  }

  const orderBeforeBadAttempts = await currentOrder(driver1Id);
  const auditCountBefore = (await auditActions('DispatchRoute', driver1Id)).length;

  // Duplicate ids rejected.
  await req('/dispatch/route-order', {
    method: 'PATCH',
    token: managerToken,
    body: { driver: driver1Id, orderedIds: [stopIdsInSummaryOrder[0], stopIdsInSummaryOrder[0]] },
    expectStatus: 400,
  });

  // Missing ids rejected (a real active stop omitted from the payload).
  await req('/dispatch/route-order', {
    method: 'PATCH',
    token: managerToken,
    body: { driver: driver1Id, orderedIds: [stopIdsInSummaryOrder[0]] },
    expectStatus: 409,
  });

  // A dispatch belonging to another driver rejected.
  const driver2Dispatch = await createAssigned(driver2._id, 'Calle de otro chofer');
  await req('/dispatch/route-order', {
    method: 'PATCH',
    token: managerToken,
    body: { driver: driver1Id, orderedIds: [...stopIdsInSummaryOrder, driver2Dispatch._id] },
    expectStatus: 409,
  });

  // A terminal dispatch cannot enter the active route.
  const toComplete = await createAssigned(driver1Id, 'Se completará');
  await req(`/dispatch/${toComplete._id}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req(`/dispatch/${toComplete._id}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req('/dispatch/route-order', {
    method: 'PATCH',
    token: managerToken,
    body: { driver: driver1Id, orderedIds: [...stopIdsInSummaryOrder, toComplete._id] },
    expectStatus: 409,
  });

  // A made-up id rejected the same way (unexpected, not part of the driver's active set).
  await req('/dispatch/route-order', {
    method: 'PATCH',
    token: managerToken,
    body: { driver: driver1Id, orderedIds: ['6a0000000000000000000000'] },
    expectStatus: 409,
  });

  // Empty payload rejected outright.
  await req('/dispatch/route-order', { method: 'PATCH', token: managerToken, body: { driver: driver1Id, orderedIds: [] }, expectStatus: 400 });
  await req('/dispatch/route-order', { method: 'PATCH', token: managerToken, body: { driver: driver1Id }, expectStatus: 400 });

  // Unauthorized: driver token on the manager-only route.
  await req('/dispatch/route-order', { method: 'PATCH', token: driver1Token, body: { driver: driver1Id, orderedIds: stopIdsInSummaryOrder }, expectStatus: 403 });

  const orderAfterBadAttempts = await currentOrder(driver1Id);
  assert(
    orderAfterBadAttempts.join(',') === orderBeforeBadAttempts.join(','),
    'none of the rejected reorder attempts caused any partial mutation of the existing route order'
  );
  const auditCountAfter = (await auditActions('DispatchRoute', driver1Id)).length;
  assert(auditCountAfter === auditCountBefore, 'none of the rejected reorder attempts created an audit event');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
