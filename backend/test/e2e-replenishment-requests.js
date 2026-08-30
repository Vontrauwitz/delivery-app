// Focused regression suite for the ReplenishmentRequest ticket workflow (PLAN.md's "SIGUIENTE
// FASE PLANIFICADA" checkpoint): creation/validation, DRAFT editing, the state machine, product
// snapshot stability, share-text generation, and AuditLog coverage. Does not re-test the
// pre-existing suggestion/config replenishment behavior — see e2e-replenishment.js for that.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets and
// reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-replenishment-requests.js (or: npm run test:e2e:replenishment-requests)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, runDbTask, finish } = require('./helpers');

const FAKE_ID = '6a0000000000000000000000';

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;

  const driver1Login = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driver1Token = driver1Login.data.token;
  const driver1Id = driver1Login.data.user.id;

  const driver2User = await createExtraUser({ name: 'Driver Two', email: 'driver2@delivery.test', role: 'driver' });
  const driver2Login = await req('/auth/login', { method: 'POST', body: { email: 'driver2@delivery.test', password: '123456' } });
  const driver2Token = driver2Login.data.token;

  const products = (await req('/products', { token: managerToken, expectStatus: 200 })).data;
  const byName = (name) => products.find((p) => p.name === name);
  const perro = byName('Perro');
  const raton = byName('Ratón');
  const leon = byName('León');
  const grillo = byName('Grillo');
  const mariposa = byName('Mariposa');
  const telarana = byName('Telaraña');

  const vehicles = (await req('/vehicles', { token: managerToken, expectStatus: 200 })).data;
  const vehicle1 = vehicles.find((v) => v.assignedDriver && v.assignedDriver._id === driver1Id);
  const vehicle2 = await runDbTask(async (mongoose) => {
    const Vehicle = require('../src/modules/vehicles/vehicle.model');
    const v = await Vehicle.create({ name: 'Carrito 2', assignedDriver: driver2User._id, active: true });
    return { _id: String(v._id) };
  });

  async function auditActions(entityId) {
    const res = await req(`/audit?entity=ReplenishmentRequest&entityId=${entityId}`, { token: managerToken, expectStatus: 200 });
    return res.data;
  }
  async function countAction(entityId, action) {
    return (await auditActions(entityId)).filter((e) => e.action === action).length;
  }

  // =========================================================================
  // CREATE — validation
  // =========================================================================

  const validCreate = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: perro._id, quantity: 5 }] },
    expectStatus: 201,
  });
  assert(validCreate.data.status === 'DRAFT', 'a manager can create a valid DRAFT ticket');
  assert(validCreate.data.items[0].productSnapshot.name === 'Perro', 'the created item carries a productSnapshot');
  assert((await countAction(validCreate.data._id, 'REPLENISHMENT_REQUEST_CREATED')) === 1, 'REPLENISHMENT_REQUEST_CREATED creates exactly one audit event');

  await req('/replenishment-requests', {
    method: 'POST',
    token: driver1Token,
    body: { items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 403,
  });

  await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [] }, expectStatus: 400 });

  await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: FAKE_ID, quantity: 1 }] },
    expectStatus: 400,
  });

  // Deactivate León for the inactive-product check, then restore it once done so it doesn't
  // affect anything downstream (a later test needs a normal active product roster).
  await req(`/products/${leon._id}`, { method: 'PUT', token: managerToken, body: { name: leon.name, basePrice: leon.basePrice, active: false }, expectStatus: 200 });
  await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: leon._id, quantity: 1 }] },
    expectStatus: 400,
  });
  await req(`/products/${leon._id}`, { method: 'PUT', token: managerToken, body: { name: leon.name, basePrice: leon.basePrice, active: true }, expectStatus: 200 });

  await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 0 }] }, expectStatus: 400 });
  await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: -3 }] }, expectStatus: 400 });
  await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 2.5 }] }, expectStatus: 400 });

  await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: {
      items: [
        { product: perro._id, quantity: 1 },
        { product: perro._id, quantity: 2 },
      ],
    },
    expectStatus: 400,
  });

  // =========================================================================
  // CREATE — driver/vehicle optionality and relationship
  // =========================================================================

  const driverOnly = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 201,
  });
  assert(driverOnly.data.driver && driverOnly.data.driver._id === driver1Id, 'a ticket can be created with only an optional driver');

  const vehicleOnly = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { vehicle: vehicle1._id, items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 201,
  });
  assert(vehicleOnly.data.vehicle && vehicleOnly.data.vehicle._id === vehicle1._id, 'a ticket can be created with only an optional vehicle');

  const validPair = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, vehicle: vehicle1._id, items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 201,
  });
  assert(validPair.data.status === 'DRAFT', 'a valid driver+vehicle assignment relationship is accepted');

  await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, vehicle: vehicle2._id, items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 400,
  });

  // =========================================================================
  // DRAFT editing
  // =========================================================================

  const editable = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: perro._id, quantity: 1 }], note: 'nota original' },
    expectStatus: 201,
  });

  const edited = await req(`/replenishment-requests/${editable.data._id}`, {
    method: 'PATCH',
    token: managerToken,
    body: { items: [{ product: raton._id, quantity: 3 }], note: 'nota editada' },
    expectStatus: 200,
  });
  assert(edited.data.items.length === 1 && edited.data.items[0].productSnapshot.name === 'Ratón', 'a DRAFT edit replaces items correctly');
  assert(edited.data.note === 'nota editada', 'a DRAFT edit replaces the note correctly');
  assert((await countAction(editable.data._id, 'REPLENISHMENT_REQUEST_UPDATED')) === 1, 'a real DRAFT edit creates exactly one audit event');

  // =========================================================================
  // Product snapshot historical stability
  // =========================================================================

  const snapshotTicket = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: grillo._id, quantity: 2 }] },
    expectStatus: 201,
  });
  assert(snapshotTicket.data.items[0].productSnapshot.name === 'Grillo', 'productSnapshot.name matches the product at creation time');

  await req(`/products/${grillo._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Grillo Renombrado', basePrice: grillo.basePrice, active: true },
    expectStatus: 200,
  });
  const afterRename = await req(`/replenishment-requests/${snapshotTicket.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(afterRename.data.items[0].productSnapshot.name === 'Grillo', 'productSnapshot.name stays historically stable after the product is renamed');

  // =========================================================================
  // State machine
  // =========================================================================

  const sm1 = await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 1 }] }, expectStatus: 201 });
  const sentTicket = await req(`/replenishment-requests/${sm1.data._id}/send`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(sentTicket.data.status === 'SENT' && !!sentTicket.data.sentAt, 'DRAFT -> SENT sets status and sentAt');
  assert((await countAction(sm1.data._id, 'REPLENISHMENT_REQUEST_SENT')) === 1, 'REPLENISHMENT_REQUEST_SENT creates exactly one audit event');

  await req(`/replenishment-requests/${sm1.data._id}`, { method: 'PATCH', token: managerToken, body: { note: 'no debería aplicar' }, expectStatus: 400 });
  assert((await countAction(sm1.data._id, 'REPLENISHMENT_REQUEST_UPDATED')) === 0, 'attempting to edit a SENT ticket creates no audit event');

  await req(`/replenishment-requests/${sm1.data._id}/send`, { method: 'POST', token: managerToken, expectStatus: 400 });
  assert((await countAction(sm1.data._id, 'REPLENISHMENT_REQUEST_SENT')) === 1, 'sending an already-SENT ticket does not create a second event');

  const fulfilled = await req(`/replenishment-requests/${sm1.data._id}/fulfill`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(fulfilled.data.status === 'FULFILLED' && !!fulfilled.data.fulfilledAt, 'SENT -> FULFILLED sets status and fulfilledAt');
  assert((await countAction(sm1.data._id, 'REPLENISHMENT_REQUEST_FULFILLED')) === 1, 'REPLENISHMENT_REQUEST_FULFILLED creates exactly one audit event');

  // Terminal statuses remain terminal.
  await req(`/replenishment-requests/${sm1.data._id}/send`, { method: 'POST', token: managerToken, expectStatus: 400 });
  await req(`/replenishment-requests/${sm1.data._id}/fulfill`, { method: 'POST', token: managerToken, expectStatus: 400 });
  await req(`/replenishment-requests/${sm1.data._id}/cancel`, { method: 'POST', token: managerToken, expectStatus: 400 });
  assert((await auditActions(sm1.data._id)).length === 3, 'a FULFILLED ticket stays terminal — no further audit events from rejected transitions');

  const sm2 = await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 1 }] }, expectStatus: 201 });
  const cancelledFromDraft = await req(`/replenishment-requests/${sm2.data._id}/cancel`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(cancelledFromDraft.data.status === 'CANCELLED' && !!cancelledFromDraft.data.cancelledAt, 'DRAFT -> CANCELLED sets status and cancelledAt');
  assert((await countAction(sm2.data._id, 'REPLENISHMENT_REQUEST_CANCELLED')) === 1, 'REPLENISHMENT_REQUEST_CANCELLED creates exactly one audit event');
  await req(`/replenishment-requests/${sm2.data._id}/cancel`, { method: 'POST', token: managerToken, expectStatus: 400 });
  assert((await countAction(sm2.data._id, 'REPLENISHMENT_REQUEST_CANCELLED')) === 1, 'cancelling an already-cancelled ticket does not create a second event');

  const sm3 = await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 1 }] }, expectStatus: 201 });
  await req(`/replenishment-requests/${sm3.data._id}/send`, { method: 'POST', token: managerToken, expectStatus: 200 });
  const cancelledFromSent = await req(`/replenishment-requests/${sm3.data._id}/cancel`, { method: 'POST', token: managerToken, expectStatus: 200 });
  assert(cancelledFromSent.data.status === 'CANCELLED', 'SENT -> CANCELLED works');

  // Invalid transitions.
  const sm4 = await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 1 }] }, expectStatus: 201 });
  await req(`/replenishment-requests/${sm4.data._id}/fulfill`, { method: 'POST', token: managerToken, expectStatus: 400 });
  assert((await countAction(sm4.data._id, 'REPLENISHMENT_REQUEST_FULFILLED')) === 0, 'DRAFT -> FULFILLED is an invalid transition and creates no audit event');

  // Fulfilled/cancelled tickets remain queryable.
  const getFulfilled = await req(`/replenishment-requests/${sm1.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(getFulfilled.data.status === 'FULFILLED', 'a FULFILLED ticket remains queryable by id');
  const listCancelled = await req('/replenishment-requests?status=CANCELLED', { token: managerToken, expectStatus: 200 });
  assert(listCancelled.data.some((t) => t._id === sm2.data._id), 'a CANCELLED ticket remains queryable via list+status filter');

  // =========================================================================
  // Unauthorized operations create no audit events
  // =========================================================================

  const forAuth = await req('/replenishment-requests', { method: 'POST', token: managerToken, body: { items: [{ product: perro._id, quantity: 1 }] }, expectStatus: 201 });
  await req(`/replenishment-requests/${forAuth.data._id}`, { method: 'PATCH', token: driver1Token, body: { note: 'intento no autorizado' }, expectStatus: 403 });
  await req(`/replenishment-requests/${forAuth.data._id}/send`, { method: 'POST', token: driver1Token, expectStatus: 403 });
  await req(`/replenishment-requests/${forAuth.data._id}/cancel`, { method: 'POST', token: driver2Token, expectStatus: 403 });
  assert((await auditActions(forAuth.data._id)).length === 1, 'unauthorized attempts (edit/send/cancel by a driver) create zero additional audit events');

  // =========================================================================
  // Share text
  // =========================================================================

  const shareTicket = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driver1Id,
      vehicle: vehicle1._id,
      items: [
        { product: perro._id, quantity: 20 },
        { product: raton._id, quantity: 50 },
      ],
      note: 'Entregar antes del viernes',
    },
    expectStatus: 201,
  });
  const { shareText } = shareTicket.data;
  assert(shareText.includes('Perro x20'), 'share text includes the correct snapshot name and quantity for item 1');
  assert(shareText.includes('Ratón x50'), 'share text includes the correct snapshot name and quantity for item 2');
  assert(shareText.includes('Chofer:'), 'share text includes the driver line when a driver is set');
  assert(shareText.includes('Vehículo:'), 'share text includes the vehicle line when a vehicle is set');
  assert(shareText.includes('Entregar antes del viernes'), 'share text includes the note when present');

  const bareTicket = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: perro._id, quantity: 1 }] },
    expectStatus: 201,
  });
  const bareShareText = bareTicket.data.shareText;
  assert(!bareShareText.includes('Chofer:'), 'share text omits the driver line cleanly when absent');
  assert(!bareShareText.includes('Vehículo:'), 'share text omits the vehicle line cleanly when absent');
  assert(!bareShareText.includes('Notas:'), 'share text omits the notes line cleanly when absent');

  // =========================================================================
  // No note/share-text leakage into AuditLog
  // =========================================================================

  const secretNote = 'CONTRASENA-SECRETA-9F3K';
  const leakCheckTicket = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: perro._id, quantity: 1 }], note: secretNote },
    expectStatus: 201,
  });
  const leakCheckEntries = await auditActions(leakCheckTicket.data._id);
  const leaked = leakCheckEntries.some((e) => JSON.stringify(e).includes(secretNote));
  assert(!leaked, 'the note text is never written into the audit trail');

  await req(`/replenishment-requests/${leakCheckTicket.data._id}`, {
    method: 'PATCH',
    token: managerToken,
    body: { note: 'otra nota distinta' },
    expectStatus: 200,
  });
  const leakCheckEntriesAfterUpdate = await auditActions(leakCheckTicket.data._id);
  const shareTextLeaked = leakCheckEntriesAfterUpdate.some((e) => JSON.stringify(e).includes(leakCheckTicket.data.shareText));
  assert(!shareTextLeaked, 'the generated share text is never written into the audit trail');

  // =========================================================================
  // Product reference protection (correction checkpoint): a product referenced by a
  // ReplenishmentRequest must count as a real reference and block hard-delete, exactly like
  // Sale/InventoryCount/Promotion/ReplenishmentConfig already do — but deactivation must still
  // work, and a genuinely unrelated product must still be deletable.
  // =========================================================================

  const referencedTicket = await req('/replenishment-requests', {
    method: 'POST',
    token: managerToken,
    body: { items: [{ product: mariposa._id, quantity: 1 }] },
    expectStatus: 201,
  });
  assert(referencedTicket.status === 201, 'setup: a ticket referencing Mariposa was created');

  const blockedDelete = await req(`/products/${mariposa._id}`, { method: 'DELETE', token: managerToken, expectStatus: 400 });
  assert(/no se puede eliminar/i.test(blockedDelete.data.error || ''), 'a product referenced by a ReplenishmentRequest cannot be hard-deleted');

  const stillActive = await req(`/products/${mariposa._id}`, { token: managerToken, expectStatus: 200 });
  assert(stillActive.data.active === true, 'the blocked-delete attempt left the product untouched');

  const deactivated = await req(`/products/${mariposa._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { name: mariposa.name, basePrice: mariposa.basePrice, active: false },
    expectStatus: 200,
  });
  assert(deactivated.data.active === false, 'a product referenced by a ReplenishmentRequest can still be deactivated');

  await req(`/products/${telarana._id}`, { method: 'DELETE', token: managerToken, expectStatus: 204 });
  const unrelatedGone = await req(`/products/${telarana._id}`, { token: managerToken, expectStatus: 404 });
  assert(unrelatedGone.status === 404, 'an unrelated, unreferenced product can still be hard-deleted');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
