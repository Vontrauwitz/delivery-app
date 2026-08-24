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

const BACKEND_ROOT = path.join(__dirname, '..');
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/delivery-app_test';
const TEST_PORT = process.env.TEST_PORT || '4100';

const testEnv = {
  ...process.env,
  MONGO_URI: TEST_MONGO_URI,
  PORT: TEST_PORT,
  E2E_BASE_URL: `http://localhost:${TEST_PORT}`,
};

async function waitForHealth(url, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not up yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Throwaway test server at ${url} never became healthy`);
}

async function main() {
  console.log(`Starting a throwaway backend server on port ${TEST_PORT}, against ${TEST_MONGO_URI}, for tests…`);
  const server = spawn('node', ['src/server.js'], { cwd: BACKEND_ROOT, env: testEnv, stdio: 'ignore' });

  let exitCode = 0;
  try {
    await waitForHealth(`http://localhost:${TEST_PORT}/health`);
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
