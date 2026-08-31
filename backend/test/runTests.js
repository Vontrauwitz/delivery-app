// Entry point for `npm test`. Runs the whole suite against an isolated, disposable test
// database and a throwaway server instance — never the developer's normal dev database or the
// dev server they might already have running on the usual port.
//
// Why a throwaway server: the e2e suites talk to the backend over HTTP (not directly to Mongo),
// so for them to actually see the isolated test database, the SERVER they're hitting has to be
// connected to it too — not just this script's own direct Mongo access in helpers.js. Spinning
// up a second server on its own port, pointed at the test DB, is what makes that true instead of
// just assumed.
//
// Override TEST_MONGO_URI / TEST_PORT if needed. The database name must still end in "_test" or
// "-test" — helpers.js's assertTestDatabase() enforces that independently, again, right before
// anything destructive actually happens, so this script isn't the only thing standing between a
// misconfiguration and real dev data.
const { spawn, execSync } = require('child_process');
const path = require('path');
const { FORBIDDEN_DEV_PORT, assertTestDbName, extractDbName, validateTestIdentity } = require('./testSafety');

const BACKEND_ROOT = path.join(__dirname, '..');
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/delivery-app_test';
const TEST_PORT = process.env.TEST_PORT || '4100';

// Fail before even spawning anything if TEST_PORT/TEST_MONGO_URI were themselves misconfigured —
// this wrapper is the one place that's supposed to guarantee isolation, so it checks its own
// inputs rather than trusting them.
if (String(TEST_PORT) === FORBIDDEN_DEV_PORT) {
  throw new Error(`TEST_PORT is set to ${FORBIDDEN_DEV_PORT} — the normal dev server port. Refusing to start.`);
}
assertTestDbName(extractDbName(TEST_MONGO_URI), { context: 'TEST_MONGO_URI' });

const testEnv = {
  ...process.env,
  MONGO_URI: TEST_MONGO_URI,
  PORT: TEST_PORT,
  E2E_BASE_URL: `http://localhost:${TEST_PORT}`,
  // Turns on the /health/test-identity route in app.js — the health-wait below (and every e2e
  // suite via helpers.js) uses it to prove it's actually talking to THIS spawned server, not some
  // other, unrelated process that happened to already be listening on TEST_PORT.
  TEST_MODE: 'true',
};

// Polls not just for liveness but for PROVEN identity — this is what would have caught the actual
// incident: if TEST_PORT is already held by another process (EADDRINUSE crashes this spawn
// silently, since stdio is 'ignore'), a plain "did /health respond?" check would happily accept
// whatever that other process is, which could easily not be a test server at all. Requiring the
// identity payload to check out means an EADDRINUSE failure surfaces as a clear timeout/mismatch
// error instead of silently running the whole suite against the wrong server.
async function waitForHealth(baseUrl, attempts = 50) {
  let lastProblems = ['server never responded'];
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/health/test-identity`);
      if (res.ok) {
        const identity = await res.json();
        const problems = validateTestIdentity(identity, { expectedPort: TEST_PORT });
        if (problems.length === 0) return;
        lastProblems = problems;
      } else {
        lastProblems = [`/health/test-identity responded ${res.status}`];
      }
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Throwaway test server at ${baseUrl} never proved its identity as the isolated test server:\n` +
      lastProblems.map((p) => `  - ${p}`).join('\n') +
      `\n(If TEST_PORT ${TEST_PORT} was already in use by another process, this is likely why — ` +
      `this wrapper refuses to run tests against a process it did not spawn itself.)`
  );
}

async function main() {
  console.log(`Starting a throwaway backend server on port ${TEST_PORT}, against ${TEST_MONGO_URI}, for tests…`);
  const server = spawn('node', ['src/server.js'], { cwd: BACKEND_ROOT, env: testEnv, stdio: 'ignore' });

  let exitCode = 0;
  try {
    await waitForHealth(`http://localhost:${TEST_PORT}`);
    execSync('npm run test:all', { cwd: BACKEND_ROOT, env: testEnv, stdio: 'inherit' });
  } catch (err) {
    exitCode = 1;
    if (err.message && !err.status) {
      // Only our own thrown errors (e.g. the health-check timeout) have a message worth
      // printing here — a failed test run already streamed its own output via stdio: 'inherit'.
      console.error(err.message);
    }
  } finally {
    server.kill();
  }
  process.exit(exitCode);
}

main();
