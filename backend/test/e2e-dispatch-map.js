// Focused regression suite for the "Mapa Operativo + Cola de Dispatch" checkpoint: UNASSIGNED
// pool, single/batch creation, single/batch assignment (and reassignment), live address
// correction with coordinate-clearing semantics, driver notification, and AuditLog coverage.
// Does not re-test the pre-existing accept/complete/cancel state machine or cross-driver
// isolation for those — see e2e-phase4.js / e2e-messaging-dispatch.js / e2e-messaging-audit.js.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets and
// reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-dispatch-map.js (or: npm run test:e2e:dispatch-map)

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
  const driver2Login = await req('/auth/login', { method: 'POST', body: { email: 'driver2@delivery.test', password: '123456' } });
  const driver2Token = driver2Login.data.token;

  async function auditActions(entityId) {
    const res = await req(`/audit?entity=Dispatch&entityId=${entityId}`, { token: managerToken, expectStatus: 200 });
    return res.data;
  }
  async function countAction(entityId, action) {
    return (await auditActions(entityId)).filter((e) => e.action === action).length;
  }
  // Counts every "Dirección actualizada" notification currently in the system, regardless of
  // recipient — used to assert exact before/after deltas around destination-edit attempts
  // (exactly +1 on a successful edit of an assigned dispatch, +0 on everything else: an
  // UNASSIGNED edit, a rejected edit, or an unauthorized attempt).
  async function countUpdateNotifications() {
    const res = await req('/messaging', { token: managerToken, expectStatus: 200 });
    return res.data.filter((m) => m.subject === 'Dirección actualizada').length;
  }

  // =========================================================================
  // QUEUE — create unassigned / batch create
  // =========================================================================

  const single = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Av. Insurgentes 100' }, expectStatus: 201 });
  assert(single.data.status === 'UNASSIGNED', 'creating a dispatch with no driver starts it UNASSIGNED');
  assert(single.data.driver === null, 'an UNASSIGNED dispatch has no driver');

  const batch = await req('/dispatch/batch', {
    method: 'POST',
    token: managerToken,
    body: { destinations: ['  Calle Falsa 123  ', '', '   ', 'Av. Reforma 200', 'Av. Reforma 200'] },
    expectStatus: 201,
  });
  assert(batch.data.createdCount === 3, 'batch create trims whitespace, ignores blank lines, and creates the rest (duplicates are just separate addresses, both valid)');
  assert(batch.data.errorCount === 0, 'no line failed in this batch');
  assert(batch.data.results.every((r) => r.status === 'created'), 'every reported result is a created destination (blank lines were never reported at all)');
  assert(batch.data.results[0].address === 'Calle Falsa 123', 'batch create trims each address');
  assert(batch.data.results.every((r) => r.dispatch.status === 'UNASSIGNED'), 'every batch-created destination enters the pool as UNASSIGNED');

  const tooMany = Array.from({ length: 51 }, (_, i) => `Calle ${i}`);
  await req('/dispatch/batch', { method: 'POST', token: managerToken, body: { destinations: tooMany }, expectStatus: 400 });

  await req('/dispatch/batch', { method: 'POST', token: managerToken, body: { destinations: ['', '   '] }, expectStatus: 400 });

  // =========================================================================
  // QUEUE — unassigned is invisible to drivers
  // =========================================================================

  const mineBefore = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  assert(!mineBefore.data.some((d) => d._id === single.data._id), 'GET /dispatch/mine never includes an UNASSIGNED dispatch');
  await req(`/dispatch/${single.data._id}`, { token: driver1Token, expectStatus: 403 });

  // =========================================================================
  // QUEUE — assign / batch assign / reassign / old-new driver authorization
  // =========================================================================

  const assigned = await req(`/dispatch/${single.data._id}/assign`, { method: 'PATCH', token: managerToken, body: { driver: driver1Id }, expectStatus: 200 });
  assert(assigned.data.status === 'PENDING', 'assigning an UNASSIGNED destination moves it to PENDING');
  assert(assigned.data.driver._id === driver1Id, 'the destination now belongs to the assigned driver');
  assert(assigned.data.routeOrder === 1, 'assignment sets a minimal routeOrder for the driver (first stop)');
  assert((await countAction(single.data._id, 'DISPATCH_ASSIGNED')) === 1, 'assigning an UNASSIGNED destination logs exactly one DISPATCH_ASSIGNED event');

  const mineAfterAssign = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  assert(mineAfterAssign.data.some((d) => d._id === single.data._id), 'the newly-assigned driver now sees the destination in their own list');
  await req(`/dispatch/${single.data._id}`, { token: driver1Token, expectStatus: 200 });

  const batchIds = batch.data.results.map((r) => r.dispatch._id);
  const batchAssignRes = await req('/dispatch/batch-assign', { method: 'POST', token: managerToken, body: { ids: batchIds, driver: driver1Id }, expectStatus: 200 });
  assert(batchAssignRes.data.assigned.length === 3 && batchAssignRes.data.failed.length === 0, 'batch-assign succeeds for every valid UNASSIGNED id');
  assert(batchAssignRes.data.assigned.every((d) => d.status === 'PENDING' && d.driver._id === driver1Id), 'every batch-assigned destination is now PENDING under the chosen driver');

  // Reassign one of them to driver2 — PENDING -> PENDING, different driver.
  const toReassign = batchIds[0];
  const reassigned = await req(`/dispatch/${toReassign}/assign`, { method: 'PATCH', token: managerToken, body: { driver: driver2._id }, expectStatus: 200 });
  assert(reassigned.data.status === 'PENDING' && reassigned.data.driver._id === String(driver2._id), 'reassigning a PENDING destination moves it to the new driver, still PENDING');
  assert((await countAction(toReassign, 'DISPATCH_REASSIGNED')) === 1, 'reassignment logs exactly one DISPATCH_REASSIGNED event (not another DISPATCH_ASSIGNED)');

  const driver1MineAfterReassign = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  assert(!driver1MineAfterReassign.data.some((d) => d._id === toReassign), 'the old driver loses access to a reassigned destination');
  const driver2Mine = await req('/dispatch/mine', { token: driver2Token, expectStatus: 200 });
  assert(driver2Mine.data.some((d) => d._id === toReassign), 'the new driver gains access to the reassigned destination');
  await req(`/dispatch/${toReassign}`, { token: driver1Token, expectStatus: 403 });
  await req(`/dispatch/${toReassign}`, { token: driver2Token, expectStatus: 200 });

  // =========================================================================
  // QUEUE — ACCEPTED reassignment blocked / terminal behavior
  // =========================================================================

  await req(`/dispatch/${single.data._id}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req(`/dispatch/${single.data._id}/assign`, { method: 'PATCH', token: managerToken, body: { driver: driver2._id }, expectStatus: 400 });
  assert((await countAction(single.data._id, 'DISPATCH_REASSIGNED')) === 0, 'a rejected reassignment attempt on an ACCEPTED dispatch creates no audit event');

  await req(`/dispatch/${single.data._id}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req(`/dispatch/${single.data._id}/assign`, { method: 'PATCH', token: managerToken, body: { driver: driver1Id }, expectStatus: 400 });

  const unassignedForCancel = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Calle Cancelable 1' }, expectStatus: 201 });
  const cancelledFromPool = await req(`/dispatch/${unassignedForCancel.data._id}/cancel`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(cancelledFromPool.data.status === 'CANCELLED', 'an UNASSIGNED destination can be cancelled directly out of the pool');
  await req(`/dispatch/${unassignedForCancel.data._id}/assign`, { method: 'PATCH', token: managerToken, body: { driver: driver1Id }, expectStatus: 400 });

  // =========================================================================
  // ADDRESS CORRECTION
  // =========================================================================

  const editUnassigned = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Dirección original A' }, expectStatus: 201 });
  const notifCountBeforeUnassignedEdit = await countUpdateNotifications();
  const editedUnassigned = await req(`/dispatch/${editUnassigned.data._id}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: 'Dirección corregida A' },
    expectStatus: 200,
  });
  assert(editedUnassigned.data.address === 'Dirección corregida A', 'editing an UNASSIGNED destination works');
  assert(editedUnassigned.data.status === 'UNASSIGNED', 'editing the destination never changes its status');
  assert((await countAction(editUnassigned.data._id, 'DISPATCH_DESTINATION_UPDATED')) === 1, 'a successful destination edit logs exactly one audit event');
  assert((await countUpdateNotifications()) === notifCountBeforeUnassignedEdit, 'editing an UNASSIGNED destination (no driver to notify) creates zero notifications');

  const notifCountBeforeInvalidEdit = await countUpdateNotifications();
  await req(`/dispatch/${editUnassigned.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: '   ' }, expectStatus: 400 });
  assert((await countAction(editUnassigned.data._id, 'DISPATCH_DESTINATION_UPDATED')) === 1, 'an invalid edit attempt (blank address) creates zero additional audit events');
  assert((await countUpdateNotifications()) === notifCountBeforeInvalidEdit, 'a rejected (blank-address) edit attempt creates zero notifications');

  const editPendingSetup = await req('/dispatch', { method: 'POST', token: managerToken, body: { driver: driver1Id, address: 'Dirección original B', latitude: 19.4, longitude: -99.1 }, expectStatus: 201 });
  const notifCountBeforePendingEdit = await countUpdateNotifications();
  const editedPending = await req(`/dispatch/${editPendingSetup.data._id}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: 'Dirección corregida B' },
    expectStatus: 200,
  });
  assert(editedPending.data.address === 'Dirección corregida B', 'editing a PENDING destination works');
  assert(editedPending.data.status === 'PENDING' && editedPending.data.driver._id === driver1Id, 'editing a PENDING destination preserves its assigned driver and status');
  assert(editedPending.data.latitude === undefined || editedPending.data.latitude === null, 'changing the address text without new coordinates clears the old (now-stale) coordinates');
  assert(editedPending.data.longitude === undefined || editedPending.data.longitude === null, 'longitude is cleared alongside latitude');
  assert((await countUpdateNotifications()) === notifCountBeforePendingEdit + 1, 'a successful edit of an assigned (PENDING) destination creates exactly one notification');

  const driver1MineAfterEdit = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  const seenByDriver = driver1MineAfterEdit.data.find((d) => d._id === editPendingSetup.data._id);
  assert(seenByDriver && seenByDriver.address === 'Dirección corregida B', 'the assigned driver sees the corrected address on their next fetch');

  const inboxAfterEdit = await req('/messaging/inbox', { token: driver1Token, expectStatus: 200 });
  const updateMessages = inboxAfterEdit.data.filter((m) => m.body === 'Se actualizó la dirección de una de tus paradas.');
  assert(updateMessages.length === 1, 'the assigned driver is notified in-app exactly once when their destination address changes');

  await req(`/dispatch/${editPendingSetup.data._id}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  const notifCountBeforeAcceptedEdit = await countUpdateNotifications();
  const editedAccepted = await req(`/dispatch/${editPendingSetup.data._id}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: 'Dirección corregida B otra vez', latitude: 19.5, longitude: -99.2 },
    expectStatus: 200,
  });
  assert(editedAccepted.data.status === 'ACCEPTED', 'editing an ACCEPTED destination works and never resets its status');
  assert(editedAccepted.data.latitude === 19.5 && editedAccepted.data.longitude === -99.2, 'supplying valid new coordinates in the same request is accepted, not cleared');
  assert(editedAccepted.data.routeOrder === editedPending.data.routeOrder, 'routeOrder is preserved across a destination edit');
  assert((await countUpdateNotifications()) === notifCountBeforeAcceptedEdit + 1, 'a successful edit of an ACCEPTED destination creates exactly one more notification');

  const notifCountBeforeCompletedRejection = await countUpdateNotifications();
  await req(`/dispatch/${editPendingSetup.data._id}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req(`/dispatch/${editPendingSetup.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: 'no debería aplicar' }, expectStatus: 400 });
  assert((await countAction(editPendingSetup.data._id, 'DISPATCH_DESTINATION_UPDATED')) === 2, 'editing a COMPLETED destination is rejected and creates no additional audit event');
  assert((await countUpdateNotifications()) === notifCountBeforeCompletedRejection, 'a rejected edit on a COMPLETED (terminal) destination creates zero notifications');

  const notifCountBeforeCancelledRejection = await countUpdateNotifications();
  await req(`/dispatch/${unassignedForCancel.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: 'no debería aplicar' }, expectStatus: 400 });
  assert((await countUpdateNotifications()) === notifCountBeforeCancelledRejection, 'a rejected edit on a CANCELLED (terminal) destination creates zero notifications');

  // Unauthorized: the route itself is manager/admin-only, so a driver token is rejected outright.
  const notifCountBeforeUnauthorized = await countUpdateNotifications();
  await req(`/dispatch/${editUnassigned.data._id}/destination`, { method: 'PATCH', token: driver1Token, body: { address: 'intento no autorizado' }, expectStatus: 403 });
  assert((await countUpdateNotifications()) === notifCountBeforeUnauthorized, 'an unauthorized edit attempt creates zero notifications');

  // The operational list ("map endpoint") reflects the corrected address immediately.
  const listAfterEdits = await req('/dispatch', { token: managerToken, expectStatus: 200 });
  const reflectedA = listAfterEdits.data.find((d) => d._id === editUnassigned.data._id);
  assert(reflectedA.address === 'Dirección corregida A', 'the dispatch list (map endpoint) reflects the corrected destination');

  // =========================================================================
  // ADDRESS CORRECTION — mapsUrl/current-map-target never goes stale
  // =========================================================================
  // mapsUrl is not a persisted field (see dispatch.service.js withMapsUrl()) — it's computed at
  // response time from whatever the document's address/latitude/longitude currently are. These
  // tests prove that end-to-end: after a correction, every read path (single GET, list/"map
  // endpoint" GET, and the assigned driver's own GET) must reflect ONLY the new destination,
  // never a URL pointing at the old one.
  const mapsUrlSetup = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, address: '123 Rue A', latitude: 10, longitude: 20 },
    expectStatus: 201,
  });
  const mapsUrlId = mapsUrlSetup.data._id;
  assert(mapsUrlSetup.data.mapsUrl.includes('10,20') || mapsUrlSetup.data.mapsUrl.includes('10%2C20') || mapsUrlSetup.data.mapsUrl.includes('10, 20'), 'sanity: initial mapsUrl targets the original coordinates');

  // Address-only correction, no new coordinates -> old coordinates are cleared (already tested
  // above), so mapsUrl must fall back to the NEW address text, never the old address and never
  // the old (now-stale) coordinates.
  const mapsUrlAfterAddressOnly = await req(`/dispatch/${mapsUrlId}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: '456 Rue B' },
    expectStatus: 200,
  });
  assert(mapsUrlAfterAddressOnly.data.address === '456 Rue B', 'destination address is now the corrected one');
  assert(mapsUrlAfterAddressOnly.data.mapsUrl.includes(encodeURIComponent('456 Rue B')), 'mapsUrl targets the corrected address');
  assert(!mapsUrlAfterAddressOnly.data.mapsUrl.includes(encodeURIComponent('123 Rue A')), 'mapsUrl no longer references the old address');
  assert(!mapsUrlAfterAddressOnly.data.mapsUrl.includes('10,20') && !mapsUrlAfterAddressOnly.data.mapsUrl.includes('10%2C20'), 'mapsUrl no longer references the old (now-cleared) coordinates');

  // Address + new coordinates together -> mapsUrl must target the NEW coordinates, not the
  // address text and not the previous coordinates.
  const mapsUrlAfterNewCoords = await req(`/dispatch/${mapsUrlId}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: '789 Rue C', latitude: 30, longitude: 40 },
    expectStatus: 200,
  });
  assert(mapsUrlAfterNewCoords.data.mapsUrl.includes('30,40') || mapsUrlAfterNewCoords.data.mapsUrl.includes('30%2C40'), 'mapsUrl targets the newly supplied coordinates');
  assert(!mapsUrlAfterNewCoords.data.mapsUrl.includes(encodeURIComponent('789 Rue C')), 'mapsUrl prefers coordinates over the address text when both are present');
  assert(!mapsUrlAfterNewCoords.data.mapsUrl.includes('10,20') && !mapsUrlAfterNewCoords.data.mapsUrl.includes('10%2C20'), 'mapsUrl does not reference the original coordinates after two corrections');

  // Every read path independently reflects the same current target — mapsUrl is recomputed on
  // each response, not cached/served from a stale prior computation.
  const mapsUrlViaGetById = await req(`/dispatch/${mapsUrlId}`, { token: managerToken, expectStatus: 200 });
  assert(mapsUrlViaGetById.data.mapsUrl === mapsUrlAfterNewCoords.data.mapsUrl, 'GET /dispatch/:id returns the same current mapsUrl');

  const mapsUrlViaList = await req('/dispatch', { token: managerToken, expectStatus: 200 });
  const mapsUrlListEntry = mapsUrlViaList.data.find((d) => d._id === mapsUrlId);
  assert(mapsUrlListEntry.mapsUrl === mapsUrlAfterNewCoords.data.mapsUrl, 'the manager list/"map endpoint" returns the same current mapsUrl');

  const mapsUrlViaDriver = await req('/dispatch/mine', { token: driver1Token, expectStatus: 200 });
  const mapsUrlDriverEntry = mapsUrlViaDriver.data.find((d) => d._id === mapsUrlId);
  assert(mapsUrlDriverEntry.mapsUrl === mapsUrlAfterNewCoords.data.mapsUrl, "the assigned driver's own list returns the same current mapsUrl, never the old one");

  // =========================================================================
  // NOTIFICATION — exact counts: only when a driver is assigned and WHERE they're going changed
  // =========================================================================

  // UNASSIGNED: no driver to notify, so correcting it must never create a notification.
  const notifyUnassignedSetup = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Sin chofer, dirección original' }, expectStatus: 201 });
  const notifyCountBeforeUnassignedEdit = await countUpdateNotifications();
  await req(`/dispatch/${notifyUnassignedSetup.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: 'Sin chofer, dirección corregida' }, expectStatus: 200 });
  assert((await countUpdateNotifications()) === notifyCountBeforeUnassignedEdit, 'correcting an UNASSIGNED destination creates zero notifications (no driver to notify)');

  // Label-only edit while assigned: WHERE the driver is going didn't change, so no notification.
  const notifyLabelSetup = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, address: 'Para prueba de solo-etiqueta', destinationLabel: 'Etiqueta original' },
    expectStatus: 201,
  });
  const notifyCountBeforeLabelEdit = await countUpdateNotifications();
  await req(`/dispatch/${notifyLabelSetup.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { destinationLabel: 'Etiqueta corregida' }, expectStatus: 200 });
  assert((await countUpdateNotifications()) === notifyCountBeforeLabelEdit, 'a destinationLabel-only edit creates zero notifications (the route itself did not change)');

  // A successful address correction on an assigned dispatch creates exactly one notification —
  // never zero, never more than one.
  const notifyOneSetup = await req('/dispatch', { method: 'POST', token: managerToken, body: { driver: driver1Id, address: 'Notif original' }, expectStatus: 201 });
  const notifyCountBeforeOneEdit = await countUpdateNotifications();
  await req(`/dispatch/${notifyOneSetup.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: 'Notif corregida' }, expectStatus: 200 });
  assert((await countUpdateNotifications()) === notifyCountBeforeOneEdit + 1, 'a successful address correction on an assigned dispatch creates exactly one notification');
  assert((await countAction(notifyOneSetup.data._id, 'DISPATCH_DESTINATION_UPDATED')) === 1, 'exactly one DISPATCH_DESTINATION_UPDATED is recorded alongside that one notification — no duplication from the notification path');

  // A rejected edit (invalid address here) must create zero notifications and zero additional
  // audit events — the business operation never happened, so nothing downstream of it should fire.
  const notifyCountBeforeRejected = await countUpdateNotifications();
  await req(`/dispatch/${notifyOneSetup.data._id}/destination`, { method: 'PATCH', token: managerToken, body: { address: '   ' }, expectStatus: 400 });
  assert((await countUpdateNotifications()) === notifyCountBeforeRejected, 'a rejected (invalid) edit creates zero notifications');
  assert((await countAction(notifyOneSetup.data._id, 'DISPATCH_DESTINATION_UPDATED')) === 1, 'a rejected edit creates no additional audit event either');

  // An unauthorized attempt (driver token on the manager/admin-only route) must also create zero
  // notifications — it never reaches the service layer at all.
  const notifyCountBeforeUnauthorized = await countUpdateNotifications();
  await req(`/dispatch/${notifyOneSetup.data._id}/destination`, { method: 'PATCH', token: driver1Token, body: { address: 'intento no autorizado' }, expectStatus: 403 });
  assert((await countUpdateNotifications()) === notifyCountBeforeUnauthorized, 'an unauthorized edit attempt creates zero notifications');

  // Failure semantics for a messaging outage during a destination update (best-effort: the
  // business update and its audit event must survive even when notify fails) are covered by the
  // dedicated suite test/e2e-dispatch-notification-failure.js, not duplicated here.

  // =========================================================================
  // MAP — coordinates handled honestly
  // =========================================================================

  const withCoords = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Con coordenadas', latitude: 19.43, longitude: -99.13 }, expectStatus: 201 });
  assert(withCoords.data.latitude === 19.43 && withCoords.data.longitude === -99.13, 'a destination created with valid coordinates keeps them exactly');
  assert(withCoords.data.mapsUrl.includes('19.43'), 'mapsUrl uses the real coordinates when present');

  const withoutCoords = await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Sin coordenadas 1' }, expectStatus: 201 });
  assert(withoutCoords.data.latitude === undefined || withoutCoords.data.latitude === null, 'a destination created without coordinates never has them fabricated');
  assert(withoutCoords.data.mapsUrl.includes(encodeURIComponent('Sin coordenadas 1')), 'mapsUrl falls back to the address itself when no coordinates exist — still a valid, usable link');

  await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Coordenadas inválidas', latitude: 999, longitude: 0 }, expectStatus: 400 });
  await req('/dispatch', { method: 'POST', token: managerToken, body: { address: 'Solo latitud', latitude: 19.4 }, expectStatus: 400 });

  const currentLocations = await req('/locations/current', { token: managerToken, expectStatus: 200 });
  assert(Array.isArray(currentLocations.data), 'the existing driver-locations endpoint (reused for the map view) still works unchanged');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
