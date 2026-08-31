// Deterministic, DB-free regression test for the e2e test-harness safety guards in
// test/testSafety.js — proving the exact accident (e2e tests silently hitting a real dev server:
// database "delivery-app", port 4000) is now structurally impossible, not just fixed by
// happenstance. No server, no Mongo connection — pure function checks plus one child-process
// check that the real test/helpers.js module (not just the extracted logic) refuses to load
// against the forbidden dev port.
//
// Usage: node test/unit-test-harness-safety.js (or: npm run test:unit:test-harness-safety)

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { assertSafeTestBase, assertTestDbName, extractDbName, validateTestIdentity } = require('./testSafety');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// --- assertSafeTestBase: the exact incident port ---
check(throws(() => assertSafeTestBase('http://localhost:4000')), 'assertSafeTestBase rejects port 4000 (the real dev server port from the incident)');
check(!throws(() => assertSafeTestBase('http://localhost:4100')), 'assertSafeTestBase accepts the dedicated test port 4100');
check(!throws(() => assertSafeTestBase('http://localhost:5555')), 'assertSafeTestBase accepts any other non-4000 port');

// --- extractDbName / assertTestDbName: the exact incident database name ---
check(extractDbName('mongodb://127.0.0.1:27017/delivery-app') === 'delivery-app', 'extractDbName parses the real dev database name correctly');
check(throws(() => assertTestDbName(extractDbName('mongodb://127.0.0.1:27017/delivery-app'))), 'assertTestDbName rejects "delivery-app" (the real dev database from the incident)');
check(!throws(() => assertTestDbName(extractDbName('mongodb://127.0.0.1:27017/delivery-app_test'))), 'assertTestDbName accepts "delivery-app_test"');
check(!throws(() => assertTestDbName(extractDbName('mongodb://127.0.0.1:27017/delivery-app-test?retryWrites=true'))), 'assertTestDbName accepts a "-test" suffix and tolerates query params');

// --- validateTestIdentity: the exact incident server identity ---
const incidentIdentity = { env: 'development', dbName: 'delivery-app', port: 4000 };
const incidentProblems = validateTestIdentity(incidentIdentity, { expectedPort: '4100' });
check(incidentProblems.length > 0, 'validateTestIdentity flags the exact incident identity (dev env, dev db, dev port) as unsafe');

const goodIdentity = { env: 'test', dbName: 'delivery-app_test', port: '4100' };
check(validateTestIdentity(goodIdentity, { expectedPort: '4100' }).length === 0, 'validateTestIdentity accepts a genuine test-server identity');

check(validateTestIdentity(null).length > 0, 'validateTestIdentity flags a missing identity payload (e.g. a 404 from a real dev server) as unsafe');

const wrongPortIdentity = { env: 'test', dbName: 'delivery-app_test', port: '4100' };
check(
  validateTestIdentity(wrongPortIdentity, { expectedPort: '9999' }).length > 0,
  'validateTestIdentity flags a test server answering on the wrong (unexpected) test port'
);

// --- Integration: the real helpers.js module refuses to even load against the forbidden port ---
// This exercises the actual production code path (module-load-time assertSafeTestBase call in
// helpers.js), not just the extracted testSafety function, via a child process so this process's
// own already-loaded module cache can't hide a regression.
function requireHelpersWithBase(base) {
  try {
    execFileSync(process.execPath, ['-e', "require('./test/helpers.js')"], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, E2E_BASE_URL: base },
      stdio: 'pipe',
    });
    return { threw: false };
  } catch (err) {
    return { threw: true, stderr: err.stderr ? err.stderr.toString() : '' };
  }
}

const devPortResult = requireHelpersWithBase('http://localhost:4000');
check(devPortResult.threw, 'test/helpers.js itself refuses to load when E2E_BASE_URL points at port 4000');
check(
  devPortResult.threw && /4000/.test(devPortResult.stderr),
  'the refusal error clearly names the forbidden port'
);

const testPortResult = requireHelpersWithBase('http://localhost:4100');
check(!testPortResult.threw, 'test/helpers.js loads normally when E2E_BASE_URL points at the dedicated test port');

console.log('\n--- Summary ---');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
}
