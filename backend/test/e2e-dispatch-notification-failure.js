// Focused regression test for the notification-failure semantic chosen in the Mapa Operativo
// pre-commit review: a destination correction is the primary business operation and must
// succeed — and be audited exactly once — even if the best-effort driver notification fails.
// See dispatch.service.js updateDestination(): audit fires unconditionally right after the save
// (matching every other mutation in that file), and the messaging call after it is wrapped in a
// try/catch that logs and swallows, never re-throws. This is deliberately NOT a Mongo
// transaction — the codebase has no precedent for one, and none is needed: the notification is a
// side effect of an already-durable state change, not a precondition for it.
//
// Uses runDbTask (see helpers.js, the same mechanism createExtraUser already relies on) to call
// dispatch.service.updateDestination() directly, in-process, with messaging.service.sendMessage
// monkey-patched to throw — a real messaging failure can't be induced from outside over HTTP.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI for the
// setup/verification steps that go through the HTTP API; the failure-injection step itself
// bypasses HTTP and talks to the service layer directly against that same database.
//
// Usage: node test/e2e-dispatch-notification-failure.js (or: npm run test:e2e:dispatch-notification-failure)

const path = require('path');
const { assert, req, assertServerReachable, resetAndSeed, runDbTask, finish } = require('./helpers');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPDATE_BODY = 'Se actualizó la dirección de una de tus paradas.';

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const managerId = managerLogin.data.user.id;

  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;

  const setup = await req('/dispatch', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, address: 'Dirección original' },
    expectStatus: 201,
  });
  const dispatchId = setup.data._id;

  // Inject a messaging failure directly at the service layer and call updateDestination() the
  // same way the controller does — no HTTP route can simulate this from outside the process.
  const injected = await runDbTask(async () => {
    const messagingService = require(path.join(BACKEND_ROOT, 'src/modules/messaging/messaging.service'));
    const dispatchService = require(path.join(BACKEND_ROOT, 'src/modules/dispatch/dispatch.service'));

    const originalSendMessage = messagingService.sendMessage;
    messagingService.sendMessage = async () => {
      throw new Error('Simulated messaging outage');
    };

    let updated = null;
    let threw = null;
    try {
      updated = await dispatchService.updateDestination(dispatchId, { address: 'Dirección corregida tras falla' }, managerId);
    } catch (err) {
      threw = err;
    } finally {
      messagingService.sendMessage = originalSendMessage;
    }
    return { updated, threw };
  });

  assert(injected.threw === null, 'updateDestination does not throw when the notification send fails (best-effort semantics)');
  assert(injected.updated && injected.updated.address === 'Dirección corregida tras falla', 'updateDestination still returns the corrected destination when the notification fails');

  // Verify independently, over HTTP, that the correction is durable and audited exactly once —
  // proving there is no half-applied state left behind by the failed notification attempt.
  const afterFailure = await req(`/dispatch/${dispatchId}`, { token: managerToken, expectStatus: 200 });
  assert(afterFailure.data.address === 'Dirección corregida tras falla', 'GET /dispatch/:id confirms the correction persisted despite the notification failure');

  const auditAfterFailure = await req(`/audit?entity=Dispatch&entityId=${dispatchId}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditAfterFailure.data.filter((e) => e.action === 'DISPATCH_DESTINATION_UPDATED').length === 1,
    'exactly one DISPATCH_DESTINATION_UPDATED audit event exists even though the notification failed'
  );

  const inboxAfterFailure = await req('/messaging/inbox', { token: driverToken, expectStatus: 200 });
  assert(!inboxAfterFailure.data.some((m) => m.body === UPDATE_BODY), 'no notification was actually delivered for the edit whose send failed');

  // Sanity: with the real sendMessage restored, a subsequent edit notifies normally — proving the
  // monkey-patch above didn't leak past its own call and silently break the ordinary path.
  const secondEdit = await req(`/dispatch/${dispatchId}/destination`, {
    method: 'PATCH',
    token: managerToken,
    body: { address: 'Dirección corregida de nuevo, con notificación normal' },
    expectStatus: 200,
  });
  assert(secondEdit.data.address === 'Dirección corregida de nuevo, con notificación normal', 'a subsequent, unpatched edit still succeeds normally');

  const inboxAfterSecondEdit = await req('/messaging/inbox', { token: driverToken, expectStatus: 200 });
  assert(inboxAfterSecondEdit.data.some((m) => m.body === UPDATE_BODY), 'the normal (non-patched) path still delivers the notification correctly');

  const auditAfterSecondEdit = await req(`/audit?entity=Dispatch&entityId=${dispatchId}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditAfterSecondEdit.data.filter((e) => e.action === 'DISPATCH_DESTINATION_UPDATED').length === 2,
    'the second edit adds exactly one more audit event — no duplicate written because of the notification path'
  );

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
