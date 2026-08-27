// Driver management regression suite: manager-only CRUD over driver accounts (Configuración >
// Choferes), delete-safety (reference check before hard delete), the active-flag enforcement
// added to the auth middleware, and the DRIVER_* audit trail.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-driver-management.js  (or: npm run test:e2e:driver-management)

const { assert, req, assertServerReachable, resetAndSeed, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  assert(managerLogin.status === 200, 'manager login succeeds');
  const managerToken = managerLogin.data.token;

  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  assert(driverLogin.status === 200, 'driver login succeeds');
  const driverToken = driverLogin.data.token;
  const seededDriverId = driverLogin.data.user.id;

  // --- non-manager cannot manage drivers ---------------------------------------------------
  await req('/users', {
    method: 'POST',
    token: driverToken,
    body: { name: 'Should Not Exist', email: 'blocked@delivery.test', password: '123456' },
    expectStatus: 403,
  });
  await req(`/users/${seededDriverId}`, { method: 'PUT', token: driverToken, body: { name: 'Hacked' }, expectStatus: 403 });
  await req(`/users/${seededDriverId}`, { method: 'DELETE', token: driverToken, expectStatus: 403 });

  // --- manager can create driver ------------------------------------------------------------
  const createRes = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Temp Driver', email: 'temp-driver@delivery.test', password: '123456' },
    expectStatus: 201,
  });
  assert(createRes.data.role === 'driver', 'created account has role driver');
  assert(createRes.data.active === true, 'created driver is active by default');
  assert(createRes.data.passwordHash === undefined, 'passwordHash is never returned on create');
  const tempId = createRes.data._id;

  // --- duplicate email rejected --------------------------------------------------------------
  const dupRes = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Duplicate', email: 'temp-driver@delivery.test', password: '123456' },
    expectStatus: 400,
  });
  assert(/email/i.test(dupRes.data?.error || ''), 'duplicate email create is rejected with a clear message');

  // Also rejected against an email that belongs to a non-driver (the seeded manager) —
  // uniqueness is global across the User collection, not just among drivers.
  await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Impersonator', email: 'manager@delivery.test', password: '123456' },
    expectStatus: 400,
  });

  // --- manager can edit driver ----------------------------------------------------------------
  const editRes = await req(`/users/${tempId}`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Temp Driver Edited' },
    expectStatus: 200,
  });
  assert(editRes.data.name === 'Temp Driver Edited', 'name edit is applied');
  assert(editRes.data.passwordHash === undefined, 'passwordHash is never returned on update');

  // Duplicate email on edit is rejected the same way as on create.
  await req(`/users/${tempId}`, { method: 'PUT', token: managerToken, body: { email: 'driver@delivery.test' }, expectStatus: 400 });

  // --- a session for the temp driver, captured BEFORE deactivation --------------------------
  const tempLoginBefore = await req('/auth/login', {
    method: 'POST',
    body: { email: 'temp-driver@delivery.test', password: '123456' },
  });
  assert(tempLoginBefore.status === 200, 'temp driver can log in while active');
  const tempToken = tempLoginBefore.data.token;

  await req('/users/me', { token: tempToken, expectStatus: 200 });

  // --- deactivate --------------------------------------------------------------------------
  const deactivateRes = await req(`/users/${tempId}`, { method: 'PUT', token: managerToken, body: { active: false }, expectStatus: 200 });
  assert(deactivateRes.data.active === false, 'deactivate flips active to false');

  // Login is refused for a deactivated account (already-existing auth.service behavior).
  await req('/auth/login', { method: 'POST', body: { email: 'temp-driver@delivery.test', password: '123456' }, expectStatus: 401 });

  // A token issued BEFORE deactivation must stop working too, not just future logins — this is
  // the auth middleware behavior added in this tranche (previously only login checked `active`).
  const staleAttempt = await req('/users/me', { token: tempToken, expectStatus: 401 });
  assert(staleAttempt.data?.error === 'Cuenta desactivada', 'a pre-existing token is rejected once the account is deactivated');

  // --- reactivate: fully reversible, including the old token ---------------------------------
  const reactivateRes = await req(`/users/${tempId}`, { method: 'PUT', token: managerToken, body: { active: true }, expectStatus: 200 });
  assert(reactivateRes.data.active === true, 'reactivate flips active back to true');
  await req('/users/me', { token: tempToken, expectStatus: 200 });
  const tempLoginAfter = await req('/auth/login', { method: 'POST', body: { email: 'temp-driver@delivery.test', password: '123456' } });
  assert(tempLoginAfter.status === 200, 'login works again after reactivation');

  // --- password change is separate/deliberate, never an accidental overwrite -----------------
  await req(`/users/${tempId}`, { method: 'PUT', token: managerToken, body: { name: 'Temp Driver Edited' }, expectStatus: 200 });
  const stillOldPassword = await req('/auth/login', { method: 'POST', body: { email: 'temp-driver@delivery.test', password: '123456' } });
  assert(stillOldPassword.status === 200, 'editing unrelated fields never touches the password');

  await req(`/users/${tempId}`, { method: 'PUT', token: managerToken, body: { password: 'nuevaClave1' }, expectStatus: 200 });
  await req('/auth/login', { method: 'POST', body: { email: 'temp-driver@delivery.test', password: '123456' }, expectStatus: 401 });
  const newPasswordLogin = await req('/auth/login', { method: 'POST', body: { email: 'temp-driver@delivery.test', password: 'nuevaClave1' } });
  assert(newPasswordLogin.status === 200, 'the new password takes effect');

  // --- audit trail for this driver's own profile actions --------------------------------------
  const auditRes = await req(`/audit?entity=User&entityId=${tempId}`, { token: managerToken, expectStatus: 200 });
  const actions = auditRes.data.map((entry) => entry.action);
  assert(actions.includes('DRIVER_CREATE'), 'DRIVER_CREATE was audited');
  assert(actions.includes('DRIVER_UPDATE'), 'DRIVER_UPDATE was audited (name/password edits)');
  assert(actions.includes('DRIVER_DEACTIVATE'), 'DRIVER_DEACTIVATE was audited');
  assert(actions.includes('DRIVER_ACTIVATE'), 'DRIVER_ACTIVATE was audited');

  // --- unreferenced driver can be deleted ------------------------------------------------------
  await req(`/users/${tempId}`, { method: 'DELETE', token: managerToken, expectStatus: 204 });
  await req(`/users/${tempId}`, { token: managerToken, expectStatus: 404 });

  const auditAfterDelete = await req(`/audit?entity=User&entityId=${tempId}`, { token: managerToken, expectStatus: 200 });
  assert(auditAfterDelete.data.map((e) => e.action).includes('DRIVER_DELETE'), 'DRIVER_DELETE was audited, and survives the driver being gone');

  // --- referenced driver delete is blocked -----------------------------------------------------
  const refCreateRes = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Referenced Driver', email: 'referenced-driver@delivery.test', password: '123456' },
    expectStatus: 201,
  });
  const referencedId = refCreateRes.data._id;

  // A single manager-created ScheduledShift is enough real operational data to block deletion —
  // no need to spin up a full sale/inventory/vehicle chain for this.
  await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: referencedId,
      scheduledStart: new Date(Date.now() + 3600 * 1000).toISOString(),
      scheduledEnd: new Date(Date.now() + 7 * 3600 * 1000).toISOString(),
    },
    expectStatus: 201,
  });

  const blockedDelete = await req(`/users/${referencedId}`, { method: 'DELETE', token: managerToken, expectStatus: 409 });
  assert(blockedDelete.data?.details?.code === 'DRIVER_HAS_REFERENCES', 'blocked delete returns a structured, machine-readable conflict code');
  assert(blockedDelete.data?.details?.references?.scheduledShifts === true, 'the specific reference category (scheduled shifts) is reported');
  assert(blockedDelete.data?.details?.references?.sales === false, 'unrelated reference categories are reported as false, not omitted');
  assert(
    blockedDelete.data?.details?.references?.dispatch === false &&
      blockedDelete.data?.details?.references?.location === false &&
      blockedDelete.data?.details?.references?.messages === false,
    'dispatch/location/messages are reported (and false) even for a driver with none of those'
  );
  assert(/desactí/i.test(blockedDelete.data?.error || ''), 'the blocked message points at deactivation as the alternative');

  // Administrative audit entries about the driver's own profile (DRIVER_CREATE here) must never
  // count as "the driver has audit history" — only entries the driver themselves performed do
  // (see users.service.getDriverReferences). This driver never performed anything.
  assert(blockedDelete.data?.details?.references?.auditHistory === false, "the driver's own DRIVER_CREATE entry does not itself block their deletion");

  // The driver survives a blocked delete attempt, and the attempt itself is audited.
  await req(`/users/${referencedId}`, { token: managerToken, expectStatus: 200 });
  const refAudit = await req(`/audit?entity=User&entityId=${referencedId}`, { token: managerToken, expectStatus: 200 });
  assert(refAudit.data.map((e) => e.action).includes('DRIVER_DELETE_BLOCKED'), 'DRIVER_DELETE_BLOCKED was audited');

  // Deactivation, unlike delete, is never blocked by operational history — it's the suggested
  // safe alternative, and must actually work.
  const refDeactivate = await req(`/users/${referencedId}`, { method: 'PUT', token: managerToken, body: { active: false }, expectStatus: 200 });
  assert(refDeactivate.data.active === false, 'a referenced driver can still be deactivated');

  // --- Dispatch/Location/Message references also block delete ---------------------------------
  // Referential safety only — this does not exercise or change any Dispatch/Delivery feature.

  const dispatchDriver = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Dispatch Driver', email: 'dispatch-driver@delivery.test', password: '123456' },
    expectStatus: 201,
  });
  await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: dispatchDriver.data._id, destinationLabel: 'Cliente de prueba', address: 'Calle Falsa 123' },
    expectStatus: 201,
  });
  const dispatchBlocked = await req(`/users/${dispatchDriver.data._id}`, { method: 'DELETE', token: managerToken, expectStatus: 409 });
  assert(dispatchBlocked.data?.details?.references?.dispatch === true, 'a Dispatch pointing at the driver blocks deletion');

  const locationDriver = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Location Driver', email: 'location-driver@delivery.test', password: '123456' },
    expectStatus: 201,
  });
  const locationDriverLogin = await req('/auth/login', { method: 'POST', body: { email: 'location-driver@delivery.test', password: '123456' } });
  await req('/locations', {
    method: 'POST',
    token: locationDriverLogin.data.token,
    body: { latitude: 19.4326, longitude: -99.1332 },
    expectStatus: 201,
  });
  const locationBlocked = await req(`/users/${locationDriver.data._id}`, { method: 'DELETE', token: managerToken, expectStatus: 409 });
  assert(locationBlocked.data?.details?.references?.location === true, 'a LocationPing from the driver blocks deletion');

  const messageDriver = await req('/users', {
    method: 'POST',
    token: managerToken,
    body: { name: 'Message Driver', email: 'message-driver@delivery.test', password: '123456' },
    expectStatus: 201,
  });
  await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [messageDriver.data._id], body: 'Mensaje de prueba' },
    expectStatus: 201,
  });
  const messageBlocked = await req(`/users/${messageDriver.data._id}`, { method: 'DELETE', token: managerToken, expectStatus: 409 });
  assert(messageBlocked.data?.details?.references?.messages === true, 'being a Message recipient blocks deletion');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
