// Auth restoration regression: GET /me must return 404 "Usuario no encontrado" for a
// syntactically valid, correctly-signed JWT whose user record no longer exists (e.g. after a
// dev DB reset/reseed while a browser still holds the old token) — this is the exact signal
// AuthContext.restoreSession() relies on to distinguish "stale session, sign out" from
// "network/backend hiccup, keep retrying". A malformed/invalid token must stay a distinct 401,
// never conflated with this 404.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-auth-restore.js  (or: npm run test:e2e:auth-restore)

const { assert, req, assertServerReachable, resetAndSeed, runDbTask, createExtraUser, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  // A driver created fresh (not the shared seed driver other suites rely on) so it can be
  // safely deleted without affecting anything else.
  const ghost = await createExtraUser({ name: 'Ghost Driver', email: 'ghost@delivery.test', role: 'driver' });

  const login = await req('/auth/login', { method: 'POST', body: { email: 'ghost@delivery.test', password: '123456' } });
  assert(login.status === 200, 'the soon-to-be-deleted user can log in normally first');
  const staleToken = login.data.token;

  const meBeforeDelete = await req('/users/me', { token: staleToken, expectStatus: 200 });
  assert(meBeforeDelete.data?.email === 'ghost@delivery.test', 'GET /me works normally before the user is removed');

  // Simulate a dev DB reset/reseed: the user record disappears, but the browser's JWT (still
  // cryptographically valid — same secret, not expired) is unaffected.
  await runDbTask(async (mongoose) => {
    await mongoose.connection.db.collection('users').deleteOne({ _id: ghost._id });
  });

  const meAfterDelete = await req('/users/me', { token: staleToken, expectStatus: 404 });
  assert(meAfterDelete.data?.error === 'Usuario no encontrado', 'GET /me returns the specific "user not found" error for a stale token');

  // A malformed/garbage token must still be a distinct 401 — the two failure modes (invalid
  // token vs. vanished user for an otherwise-valid token) must never collapse into each other.
  const garbageTokenAttempt = await req('/users/me', { token: 'not-a-real-jwt', expectStatus: 401 });
  assert(garbageTokenAttempt.status === 401, 'a malformed/invalid token still gets a 401, not a 404');

  finish();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
