// Focused regression suite for the Messages + Dispatch consolidation tranche — covers only what
// changed or was previously untested: the new `important` flag on messages, destinationLabel
// becoming optional on dispatch, and manager-side validation against invalid/inactive/non-driver
// targets for both. Cross-driver isolation and the accept/complete/cancel status machine are
// already thoroughly covered by e2e-phase4.js and are not repeated here.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-messaging-dispatch.js  (or: npm run test:e2e:messaging-dispatch)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const managerId = managerLogin.data.user.id;

  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;

  // =========================================================================
  // MESSAGING — important flag
  // =========================================================================

  const importantMsg = await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driverId], subject: 'Urgente', body: 'Revisa esto ya', important: true },
    expectStatus: 201,
  });
  assert(importantMsg.data.important === true, 'a message sent with important:true stores it correctly');

  const normalMsg = await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driverId], body: 'Mensaje normal' },
    expectStatus: 201,
  });
  assert(normalMsg.data.important === false, 'important defaults to false when omitted');

  await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driverId], body: 'x', important: 'yes' },
    expectStatus: 400,
  });

  const inbox = await req('/messaging/inbox', { token: driverToken, expectStatus: 200 });
  const inboxImportant = inbox.data.find((m) => m._id === importantMsg.data._id);
  assert(inboxImportant?.important === true, 'the important flag is visible to the recipient in their inbox');

  // =========================================================================
  // MESSAGING — manager cannot send to an invalid recipient
  // =========================================================================

  await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: ['6a0000000000000000000000'], body: 'a nadie' },
    expectStatus: 400,
  });

  // A real user id, but not a driver — must be rejected the same way as a nonexistent one.
  await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [managerId], body: 'a otro manager' },
    expectStatus: 400,
  });

  // =========================================================================
  // DISPATCH — destinationLabel (customer/reference) is now optional
  // =========================================================================

  const noLabelDispatch = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, address: 'Av. Reforma 100' },
    expectStatus: 201,
  });
  assert(noLabelDispatch.data.destinationLabel === '', 'destinationLabel defaults to empty string when omitted');
  assert(
    noLabelDispatch.data.mapsUrl === `https://maps.google.com/?q=${encodeURIComponent('Av. Reforma 100')}`,
    'Open in Maps still gets a valid URL (address fallback) when no reference label was given'
  );

  // A blank/whitespace-only label is still rejected — optional means "may be omitted", not
  // "may be garbage".
  await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, destinationLabel: '   ', address: 'Av. Reforma 100' },
    expectStatus: 400,
  });

  // =========================================================================
  // DISPATCH — manager cannot assign to an invalid/inactive/non-driver target
  // =========================================================================

  await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: '6a0000000000000000000000', address: 'Calle 1' },
    expectStatus: 400,
  });

  await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: managerId, address: 'Calle 1' },
    expectStatus: 400,
  });

  const inactiveDriver = await createExtraUser({ name: 'Inactive Driver', email: 'inactive-driver@delivery.test', role: 'driver' });
  await req(`/users/${inactiveDriver._id}`, { method: 'PUT', token: managerToken, body: { active: false }, expectStatus: 200 });
  await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: String(inactiveDriver._id), address: 'Calle 1' },
    expectStatus: 400,
  });

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
