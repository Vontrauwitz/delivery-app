// Phase 4 regression suite: locations (own-location updates, manager visibility, freshness),
// messaging (single/multi recipient, inbox scoping, read state), and dispatch (own-dispatch
// scoping, accept/complete lifecycle, manager cancel).
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-phase4.js  (or: npm run test:e2e:phase4)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, runDbTask, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driver1Login = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driver1Token = driver1Login.data.token;
  assert(managerLogin.status === 200 && driver1Login.status === 200, 'manager and driver1 login succeed');

  const driver1 = (await req('/users/me', { token: driver1Token })).data;

  // Seed only creates one driver — a second one (with no vehicle assigned) is needed to test
  // cross-driver isolation for messaging/dispatch/locations.
  const driver2User = await createExtraUser({ name: 'Driver Two', email: 'driver2@delivery.test', role: 'driver' });
  const driver2Login = await req('/auth/login', { method: 'POST', body: { email: 'driver2@delivery.test', password: '123456' } });
  const driver2Token = driver2Login.data.token;
  assert(driver2Login.status === 200, 'driver2 (created without HTTP registration) can log in');
  const driver2Id = String(driver2User._id);

  // =========================================================================
  // LOCATIONS
  // =========================================================================

  // Driver cannot pretend to be another driver — the controller never reads a driver id from
  // the body at all, identity always comes from the JWT (req.user.id).
  const spoofedLocation = await req('/locations', {
    method: 'POST',
    token: driver1Token,
    body: { driver: driver2Id, latitude: 19.4326, longitude: -99.1332 },
    expectStatus: 201,
  });
  assert(spoofedLocation.data.driver === driver1._id, 'location is always recorded under the JWT identity, ignoring any driver field in the body');

  const invalidLocation = await req('/locations', {
    method: 'POST',
    token: driver1Token,
    body: { latitude: 999, longitude: -99.1332 },
    expectStatus: 400,
  });
  assert(invalidLocation.status === 400, 'out-of-range coordinates are rejected');

  await req('/locations', { method: 'POST', token: managerToken, body: { latitude: 1, longitude: 1 }, expectStatus: 403 });

  const mine1 = await req('/locations/mine', { token: driver1Token, expectStatus: 200 });
  assert(mine1.data.isStale === false, 'a location just recorded is fresh (isStale=false)');

  const mine2 = await req('/locations/mine', { token: driver2Token, expectStatus: 200 });
  assert(mine2.data === null, 'a driver who never reported a location gets null, not an error');

  // Backdate a ping for driver2 (10 minutes old — past the 5-minute freshness threshold) using
  // direct model access, since there's no HTTP way to control serverTimestamp (by design — it's
  // always "now" from the server's perspective, per the spec).
  await runDbTask(async () => {
    const LocationPing = require('../src/modules/locations/location.model');
    await LocationPing.create({
      driver: driver2Id,
      latitude: 20,
      longitude: -100,
      serverTimestamp: new Date(Date.now() - 10 * 60 * 1000),
    });
  });

  await req('/locations/current', { token: driver1Token, expectStatus: 403 });

  const current = await req('/locations/current', { token: managerToken, expectStatus: 200 });
  assert(current.data.length === 2, `manager sees all active drivers (got ${current.data.length}, want 2)`);

  const d1Row = current.data.find((r) => r.driver._id === driver1._id);
  const d2Row = current.data.find((r) => r.driver._id === driver2Id);
  assert(d1Row.vehicle?.name === 'Carrito 1', "driver1's assigned vehicle is included");
  assert(d2Row.vehicle === null, 'driver2 has no assigned vehicle -> vehicle is null');
  assert(d1Row.isStale === false, 'driver1 (just reported) is fresh');
  assert(d2Row.isStale === true, 'driver2 (10 minutes old, past the 5-minute threshold) is stale');

  // =========================================================================
  // MESSAGING
  // =========================================================================

  await req('/messaging', {
    method: 'POST',
    token: driver1Token,
    body: { recipients: [driver1._id], body: 'intento no autorizado' },
    expectStatus: 403,
  });

  const singleMsg = await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driver1._id], subject: 'Solo para ti', body: 'Mensaje individual' },
    expectStatus: 201,
  });
  assert(singleMsg.data.recipients.length === 1, 'manager can send a message to a single driver');

  const broadcastMsg = await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driver1._id, driver2Id], subject: 'Para ambos', body: 'Mensaje para varios choferes' },
    expectStatus: 201,
  });
  assert(broadcastMsg.data.recipients.length === 2, 'manager can send a message to multiple drivers at once');

  const inbox1 = await req('/messaging/inbox', { token: driver1Token, expectStatus: 200 });
  assert(inbox1.data.length === 2, `driver1 sees both messages addressed to them (got ${inbox1.data.length}, want 2)`);
  assert(inbox1.data.every((m) => m.isRead === false), 'unread messages report isRead=false');

  const inbox2 = await req('/messaging/inbox', { token: driver2Token, expectStatus: 200 });
  assert(inbox2.data.length === 1, `driver2 only sees the broadcast (own messages only) (got ${inbox2.data.length}, want 1)`);
  assert(inbox2.data[0]._id === broadcastMsg.data._id, "driver2's inbox does not include driver1's individual message");

  // Driver cannot read a message addressed to someone else via the direct GET either.
  await req(`/messaging/${singleMsg.data._id}`, { token: driver2Token, expectStatus: 403 });
  await req(`/messaging/${singleMsg.data._id}/read`, { method: 'PATCH', token: driver2Token, expectStatus: 403 });

  const readResult = await req(`/messaging/${singleMsg.data._id}/read`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert(readResult.data.isRead === true, 'marking a message read updates isRead for that driver');

  const readAgain = await req(`/messaging/${singleMsg.data._id}/read`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert(readAgain.data.readBy.length === 1, 'marking an already-read message read again is idempotent (no duplicate receipt)');

  const inbox1After = await req('/messaging/inbox', { token: driver1Token });
  const singleAfter = inbox1After.data.find((m) => m._id === singleMsg.data._id);
  const broadcastAfter = inbox1After.data.find((m) => m._id === broadcastMsg.data._id);
  assert(singleAfter.isRead === true && broadcastAfter.isRead === false, 'read state is tracked independently per message');

  const allMessages = await req('/messaging', { token: managerToken, expectStatus: 200 });
  assert(allMessages.data.length === 2, 'manager can list all sent messages');
  await req('/messaging', { token: driver1Token, expectStatus: 403 });

  // =========================================================================
  // DISPATCH
  // =========================================================================

  await req('/dispatch', {
    method: 'POST',
    token: driver1Token,
    body: { driver: driver1._id, destinationLabel: 'Bodega', address: 'Calle Falsa 123' },
    expectStatus: 403,
  });

  const dispatch1 = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1._id, destinationLabel: 'Bodega Norte', address: 'Av. Siempre Viva 742' },
    expectStatus: 201,
  });
  assert(dispatch1.data.status === 'PENDING', 'dispatch created with status PENDING');
  assert(dispatch1.data.vehicle?.name === 'Carrito 1', "vehicle auto-resolved from the driver's active assignment when not specified");
  assert(dispatch1.data.mapsUrl.includes(encodeURIComponent('Av. Siempre Viva 742')), 'mapsUrl falls back to the address when no lat/lng given');

  const dispatchWithCoords = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver2Id, destinationLabel: 'Cliente VIP', address: 'Reforma 1', latitude: 19.43, longitude: -99.13 },
    expectStatus: 201,
  });
  assert(!dispatchWithCoords.data.vehicle, 'driver2 has no assigned vehicle -> dispatch.vehicle is unset');
  assert(dispatchWithCoords.data.mapsUrl === 'https://maps.google.com/?q=19.43,-99.13', 'mapsUrl uses lat/lng when provided');

  // Driver2 cannot see or act on driver1's dispatch.
  await req(`/dispatch/${dispatch1.data._id}`, { token: driver2Token, expectStatus: 403 });
  await req(`/dispatch/${dispatch1.data._id}/accept`, { method: 'PATCH', token: driver2Token, expectStatus: 403 });

  const mineDispatch1 = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  assert(mineDispatch1.data.length === 1 && mineDispatch1.data[0]._id === dispatch1.data._id, "driver1's dispatch list contains only their own dispatch");

  const mineDispatch2 = await req('/dispatch/mine', { token: driver2Token, expectStatus: 200 });
  assert(
    mineDispatch2.data.length === 1 && mineDispatch2.data[0]._id === dispatchWithCoords.data._id,
    "driver2's dispatch list contains only their own dispatch"
  );

  // Cannot complete before accepting.
  await req(`/dispatch/${dispatch1.data._id}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 400 });

  const accepted = await req(`/dispatch/${dispatch1.data._id}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert(accepted.data.status === 'ACCEPTED' && !!accepted.data.acceptedAt, 'driver accepts their own PENDING dispatch');

  // Cannot accept twice.
  await req(`/dispatch/${dispatch1.data._id}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 400 });

  const completed = await req(`/dispatch/${dispatch1.data._id}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert(completed.data.status === 'COMPLETED' && !!completed.data.completedAt, 'driver completes their own ACCEPTED dispatch');

  // Manager cancels the other (still PENDING) dispatch.
  await req(`/dispatch/${dispatchWithCoords.data._id}/cancel`, { method: 'PATCH', token: driver2Token, expectStatus: 403 });
  const cancelled = await req(`/dispatch/${dispatchWithCoords.data._id}/cancel`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(cancelled.data.status === 'CANCELLED' && !!cancelled.data.cancelledAt, 'manager cancels a PENDING/ACCEPTED dispatch');

  // Terminal states reject further transitions.
  await req(`/dispatch/${dispatchWithCoords.data._id}/accept`, { method: 'PATCH', token: driver2Token, expectStatus: 400 });
  await req(`/dispatch/${dispatch1.data._id}/cancel`, { method: 'PATCH', token: managerToken, expectStatus: 400 });

  const allDispatch = await req('/dispatch', { token: managerToken, expectStatus: 200 });
  assert(allDispatch.data.length === 2, 'manager can list all dispatches');
  await req('/dispatch', { token: driver1Token, expectStatus: 403 });

  const filteredByStatus = await req(`/dispatch?status=COMPLETED`, { token: managerToken, expectStatus: 200 });
  assert(filteredByStatus.data.length === 1 && filteredByStatus.data[0]._id === dispatch1.data._id, 'manager can filter dispatch list by status');

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-phase4:', err);
  process.exitCode = 1;
});
