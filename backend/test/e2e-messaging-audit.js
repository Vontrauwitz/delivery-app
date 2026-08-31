// Focused regression suite for this tranche only: AuditLog coverage added to Messaging and
// Dispatch. Does not repeat cross-driver isolation, permission, or state-machine coverage
// already proven by e2e-phase4.js / e2e-messaging-dispatch.js — every check here specifically
// asserts on the audit trail (exact event counts, idempotency, and "rejected actions write
// nothing") layered on top of that already-verified behavior.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-messaging-audit.js  (or: npm run test:e2e:messaging-audit)

const { assert, req, assertServerReachable, resetAndSeed, createExtraUser, finish } = require('./helpers');

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

  async function auditActions(entity, entityId) {
    const res = await req(`/audit?entity=${entity}&entityId=${entityId}`, { token: managerToken, expectStatus: 200 });
    return res.data;
  }
  async function countAction(entity, entityId, action) {
    return (await auditActions(entity, entityId)).filter((e) => e.action === action).length;
  }

  // =========================================================================
  // MESSAGING
  // =========================================================================

  // Rejected attempts first — neither should write anything, and there's no entity id yet to
  // check against, so these just confirm the rejection itself (already covered elsewhere) as
  // setup for "rejected actions produce no message to audit against".
  await req('/messaging', { method: 'POST', token: driver1Token, body: { recipients: [driver1Id], body: 'no autorizado' }, expectStatus: 403 });
  await req('/messaging', { method: 'POST', token: managerToken, body: { recipients: [FAKE_ID], body: 'a nadie' }, expectStatus: 400 });

  const sendRes = await req('/messaging', {
    method: 'POST',
    token: managerToken,
    body: { recipients: [driver1Id], subject: 'Aviso', body: 'Turno especial mañana', important: true },
    expectStatus: 201,
  });
  const msgId = sendRes.data._id;

  assert((await countAction('Message', msgId, 'MESSAGE_SENT')) === 1, 'MESSAGE_SENT creates exactly one audit event');
  assert((await countAction('Message', msgId, 'MESSAGE_READ')) === 0, 'no MESSAGE_READ audit event exists before anyone reads it');

  const sentEntry = (await auditActions('Message', msgId)).find((e) => e.action === 'MESSAGE_SENT');
  assert(sentEntry.performedBy.email === 'manager@delivery.test', 'MESSAGE_SENT records the sending manager as actor');
  const recipientsChange = sentEntry.changes.find((c) => c.field === 'recipients');
  assert(recipientsChange?.newValue?.length === 1, 'MESSAGE_SENT metadata records the recipient list');
  const importantChange = sentEntry.changes.find((c) => c.field === 'important');
  assert(importantChange?.newValue === true, 'MESSAGE_SENT metadata records the important flag');
  const bodyLeaked = sentEntry.changes.some((c) => JSON.stringify(c).includes('Turno especial mañana'));
  assert(!bodyLeaked, 'the message body itself is never written into the audit trail');

  // A rejected cross-driver read attempt must not create a MESSAGE_READ event.
  await req(`/messaging/${msgId}/read`, { method: 'PATCH', token: driver2Token, expectStatus: 403 });
  assert((await countAction('Message', msgId, 'MESSAGE_READ')) === 0, 'a rejected cross-driver read attempt creates no audit event');

  // First real read by the actual recipient.
  await req(`/messaging/${msgId}/read`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert((await countAction('Message', msgId, 'MESSAGE_READ')) === 1, 'the first MESSAGE_READ creates exactly one audit event');

  // Idempotent re-read: the exact same recipient marking the same already-read message again.
  await req(`/messaging/${msgId}/read`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  await req(`/messaging/${msgId}/read`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert((await countAction('Message', msgId, 'MESSAGE_READ')) === 1, 'repeated mark-read never creates a duplicate MESSAGE_READ event');

  const finalMessageAudit = await auditActions('Message', msgId);
  assert(finalMessageAudit.length === 2, 'exactly two audit entries total for this message (SENT + READ, nothing more)');

  // =========================================================================
  // DISPATCH
  // =========================================================================

  await req('/dispatch', { method: 'POST', token: managerToken, body: { driver: FAKE_ID, address: 'Calle 1' }, expectStatus: 400 });
  await req('/dispatch', { method: 'POST', token: driver1Token, body: { driver: driver1Id, address: 'Calle 1' }, expectStatus: 403 });

  const createRes = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, address: 'Av. Principal 100' },
    expectStatus: 201,
  });
  const dispatchId = createRes.data._id;

  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_CREATED')) === 1, 'DISPATCH_CREATED creates exactly one event');
  const createdEntry = (await auditActions('Dispatch', dispatchId)).find((e) => e.action === 'DISPATCH_CREATED');
  assert(createdEntry.performedBy.email === 'manager@delivery.test', 'DISPATCH_CREATED records the creating manager as actor');
  assert(createdEntry.changes[0].newValue.address === 'Av. Principal 100', 'DISPATCH_CREATED metadata records the address');

  // Rejected: completing before accepting.
  await req(`/dispatch/${dispatchId}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 400 });
  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_COMPLETED')) === 0, 'an invalid PENDING->COMPLETED transition creates no audit event');

  // Rejected: another driver trying to accept.
  await req(`/dispatch/${dispatchId}/accept`, { method: 'PATCH', token: driver2Token, expectStatus: 403 });
  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_ACCEPTED')) === 0, 'a rejected cross-driver accept creates no audit event');

  await req(`/dispatch/${dispatchId}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_ACCEPTED')) === 1, 'ACCEPTED creates exactly one event');
  const acceptedEntry = (await auditActions('Dispatch', dispatchId)).find((e) => e.action === 'DISPATCH_ACCEPTED');
  assert(acceptedEntry.performedBy.email === 'driver@delivery.test', 'DISPATCH_ACCEPTED records the accepting driver as actor');
  assert(acceptedEntry.changes[0].oldValue === 'PENDING' && acceptedEntry.changes[0].newValue === 'ACCEPTED', 'ACCEPTED records the correct before/after status');

  // Rejected: accepting twice.
  await req(`/dispatch/${dispatchId}/accept`, { method: 'PATCH', token: driver1Token, expectStatus: 400 });
  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_ACCEPTED')) === 1, 'accepting an already-accepted dispatch does not create a second event');

  await req(`/dispatch/${dispatchId}/complete`, { method: 'PATCH', token: driver1Token, expectStatus: 200 });
  assert((await countAction('Dispatch', dispatchId, 'DISPATCH_COMPLETED')) === 1, 'COMPLETED creates exactly one event');

  const finalDispatchAudit = await auditActions('Dispatch', dispatchId);
  assert(finalDispatchAudit.length === 3, 'exactly three audit entries for this dispatch (CREATED + ACCEPTED + COMPLETED, nothing more)');

  // A second, independent dispatch for the CANCELLED path (a completed dispatch can't also be cancelled).
  const createRes2 = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driver1Id, address: 'Av. Secundaria 200' },
    expectStatus: 201,
  });
  const dispatch2Id = createRes2.data._id;

  // Rejected: a driver (non-manager) trying to cancel.
  await req(`/dispatch/${dispatch2Id}/cancel`, { method: 'PATCH', token: driver1Token, expectStatus: 403 });
  assert((await countAction('Dispatch', dispatch2Id, 'DISPATCH_CANCELLED')) === 0, 'a rejected non-manager cancel creates no audit event');

  await req(`/dispatch/${dispatch2Id}/cancel`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert((await countAction('Dispatch', dispatch2Id, 'DISPATCH_CANCELLED')) === 1, 'CANCELLED creates exactly one event');
  const cancelledEntry = (await auditActions('Dispatch', dispatch2Id)).find((e) => e.action === 'DISPATCH_CANCELLED');
  assert(cancelledEntry.performedBy.email === 'manager@delivery.test', 'DISPATCH_CANCELLED records the cancelling manager as actor');

  // Rejected: cancelling an already-cancelled dispatch.
  await req(`/dispatch/${dispatch2Id}/cancel`, { method: 'PATCH', token: managerToken, expectStatus: 400 });
  assert((await countAction('Dispatch', dispatch2Id, 'DISPATCH_CANCELLED')) === 1, 'cancelling an already-cancelled dispatch does not create a second event');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
