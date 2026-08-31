// Shared safety guards for the e2e test harness. Extracted into their own module (rather than
// living only in helpers.js) so both helpers.js (the HTTP-test layer) and runTests.js (the
// process-spawning wrapper) enforce the exact same rules from one place, and so the rules
// themselves can be unit-tested directly without spinning up a server or a database — see
// test/unit-test-harness-safety.js.
//
// Background: an incident let e2e tests silently send their HTTP requests to a real dev server
// (port 4000, database "delivery-app") instead of the isolated throwaway test server, because
// nothing actually verified the IDENTITY of whatever server answered — only that something did.
// These guards close that gap with two independent checks (defense in depth, not just one):
//   1. assertSafeTestBase() — the resolved e2e base URL itself must never be the well-known dev
//      port, checked before any HTTP call is made at all.
//   2. validateTestIdentity() — the server actually being talked to must prove (via a
//      TEST_MODE-only endpoint) that it is running in test mode, against a database whose name
//      ends in "_test"/"-test", on the expected test port.

const FORBIDDEN_DEV_PORT = '4000';
const TEST_NAME_PATTERN = /[-_]test$/i;

// Extracts the database name from a Mongo connection string, robust to query params
// (?retryWrites=...) and both mongodb:// and mongodb+srv:// forms.
function extractDbName(uri) {
  const withoutQuery = uri.split('?')[0];
  return withoutQuery.split('/').pop();
}

function assertTestDbName(dbName, { context = 'database' } = {}) {
  if (!dbName || !TEST_NAME_PATTERN.test(dbName)) {
    throw new Error(
      `\nRefusing to proceed — target ${context} "${dbName}" does not look like a test database ` +
        `(its name must end in "_test" or "-test").\n`
    );
  }
}

// Guard #1: the e2e base URL itself must never point at the normal dev port, regardless of how it
// was derived (explicit E2E_BASE_URL override, TEST_PORT, or any future fallback). Runs at
// helpers.js module-load time, before a single HTTP request is made.
function assertSafeTestBase(base) {
  let url;
  try {
    url = new URL(base);
  } catch (err) {
    throw new Error(`Invalid e2e base URL "${base}": ${err.message}`);
  }
  if (url.port === FORBIDDEN_DEV_PORT) {
    throw new Error(
      `\nRefusing to run e2e tests against port ${FORBIDDEN_DEV_PORT} (${base}) — that is the ` +
        `normal dev server port, never the isolated test port. This guard exists specifically ` +
        `because a real dev server left running on this port once let e2e tests silently write ` +
        `into the real dev database. Point E2E_BASE_URL/TEST_PORT at the dedicated test server ` +
        `instead (default: http://localhost:4100).\n`
    );
  }
}

// Guard #2: the server actually answering must prove its own identity — env=test, a test-named
// database, and the expected port — not just respond to /health. Returns a list of problems
// (empty = OK) rather than throwing directly, so callers can compose one clear error message.
function validateTestIdentity(identity, { expectedPort } = {}) {
  const problems = [];
  if (!identity || typeof identity !== 'object') {
    problems.push('no identity payload received (is the server actually running in test mode?)');
    return problems;
  }
  if (identity.env !== 'test') {
    problems.push(`env is "${identity.env}", expected "test"`);
  }
  if (!identity.dbName || !TEST_NAME_PATTERN.test(identity.dbName)) {
    problems.push(`dbName "${identity.dbName}" does not end in "_test"/"-test"`);
  }
  if (String(identity.port) === FORBIDDEN_DEV_PORT) {
    problems.push(`server reports port ${FORBIDDEN_DEV_PORT} — the normal dev server port`);
  }
  if (expectedPort !== undefined && String(identity.port) !== String(expectedPort)) {
    problems.push(`server reports port ${identity.port}, expected ${expectedPort}`);
  }
  return problems;
}

module.exports = { FORBIDDEN_DEV_PORT, TEST_NAME_PATTERN, extractDbName, assertTestDbName, assertSafeTestBase, validateTestIdentity };
