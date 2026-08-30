const { execSync } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');

const BACKEND_ROOT = path.join(__dirname, '..');
const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
// This suite must never default to the normal dev database — only ever an explicit override or
// a name that's unambiguously a test database. See assertTestDatabase below for the hard guard
// that backs this up before anything destructive actually runs.
const MONGO_URI = process.env.MONGO_URI || process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/delivery-app_test';

let failures = 0;

// Extracts the database name from a Mongo connection string, robust to query params
// (?retryWrites=...) and both mongodb:// and mongodb+srv:// forms.
function extractDbName(uri) {
  const withoutQuery = uri.split('?')[0];
  return withoutQuery.split('/').pop();
}

// Hard safety guard: resetAndSeed() is destructive (it shells out to the same script
// `npm run db:reset` uses). This suite must NEVER be able to wipe the normal development
// database just because MONGO_URI was unset or misconfigured when tests ran — so it refuses
// outright unless the target database name is unambiguously a test database (ends in "_test"
// or "-test"). No silent fallback to the normal dev DB: if this check fails, throw and abort
// before deleting anything. `npm run db:reset` itself has no such check — it's meant to be able
// to target the real dev database, deliberately, when run directly by a developer.
function assertTestDatabase(uri) {
  const dbName = extractDbName(uri);
  if (!/[-_]test$/i.test(dbName)) {
    throw new Error(
      `\nRefusing to run the destructive test reset — target database "${dbName}" does not look ` +
        `like a test database (its name must end in "_test" or "-test").\n` +
        `This guard exists specifically so a misconfigured MONGO_URI can never wipe the normal ` +
        `development database when tests run.\n` +
        `Set MONGO_URI or TEST_MONGO_URI to a database name like "delivery-app_test" and try again.\n` +
        `(Current value: ${uri})\n`
    );
  }
}

function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

async function req(path, { method = 'GET', body, token, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (expectStatus !== undefined) {
    assert(
      res.status === expectStatus,
      `${method} ${path} -> expected ${expectStatus}, got ${res.status} (${JSON.stringify(data)})`
    );
  }
  return { status: res.status, data };
}

async function assertServerReachable() {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) throw new Error(`unexpected status ${res.status}`);
  } catch (err) {
    console.error(
      `\nCannot reach the backend at ${BASE}. Start it first (e.g. "npm run dev" in backend/) before running this suite.\n`
    );
    throw err;
  }
}

// Clears the collections the reset script doesn't touch itself (Sale/InventorySession/
// InventoryCount/Closing/WorkShift/AuditLog/ReplenishmentConfig/LocationPing/Message/Dispatch/
// DriverScheduleException/ReplenishmentRequest), then runs the DESTRUCTIVE db:reset script for a
// clean, deterministic starting point: 1
// manager, 1 driver, 1 vehicle assigned to the driver, 10 products (db:reset clears/recreates
// User, Product, Vehicle, Promotion, AccountingPeriod, and ScheduledShift itself).
//
// This suite needs a true clean slate to be deterministic, so — unlike everyday `npm run seed`,
// which is safe and non-destructive — running these tests IS destructive to whatever database
// MONGO_URI points at. That's always been true (this helper already wiped the collections above
// on every run); it's just now explicit that it goes through the same script `npm run db:reset`
// uses, rather than the now-safe `seed` script.
async function resetAndSeed() {
  assertTestDatabase(MONGO_URI);

  await mongoose.connect(MONGO_URI);
  await mongoose.connection.db.collection('sales').deleteMany({});
  await mongoose.connection.db.collection('inventorysessions').deleteMany({});
  await mongoose.connection.db.collection('inventorycounts').deleteMany({});
  await mongoose.connection.db.collection('closings').deleteMany({});
  await mongoose.connection.db.collection('workshifts').deleteMany({});
  await mongoose.connection.db.collection('auditlogs').deleteMany({});
  await mongoose.connection.db.collection('replenishmentconfigs').deleteMany({});
  await mongoose.connection.db.collection('locationpings').deleteMany({});
  await mongoose.connection.db.collection('messages').deleteMany({});
  await mongoose.connection.db.collection('dispatches').deleteMany({});
  await mongoose.connection.db.collection('driverscheduleexceptions').deleteMany({});
  await mongoose.connection.db.collection('replenishmentrequests').deleteMany({});
  await mongoose.disconnect();

  // Explicit env, not ambient inheritance — dbReset.js must target the exact same
  // already-guarded MONGO_URI this function just validated, never whatever happens to be in
  // the parent shell's environment.
  execSync('node src/dbReset.js', { cwd: BACKEND_ROOT, stdio: 'ignore', env: { ...process.env, MONGO_URI } });
}

// Runs fn with a live mongoose connection (for direct model access — e.g. seeding a second
// driver, or backdating a document's timestamp for a deterministic test — things the HTTP API
// has no route for), then disconnects. Not for use while resetAndSeed/the server itself might
// be connecting concurrently — these test suites are sequential, never run in parallel.
async function runDbTask(fn) {
  await mongoose.connect(MONGO_URI);
  try {
    return await fn(mongoose);
  } finally {
    await mongoose.disconnect();
  }
}

// Creates an additional user directly (there's no public registration endpoint — users are
// provisioned by seed/admin scripts only). Used by tests that need a second driver.
async function createExtraUser({ name, email, password = '123456', role }) {
  return runDbTask(async () => {
    const { createUser } = require(path.join(BACKEND_ROOT, 'src/modules/users/users.service'));
    return createUser({ name, email, password, role });
  });
}

// Selects a seeded product by its stable `name`, never by array position — Product.create()
// inserts all seed products in the same millisecond, so a plain `sort({createdAt:-1})` (as
// used by GET /products) does not guarantee insertion order comes back on top.
function findProductByName(products, name) {
  const product = products.find((p) => p.name === name);
  if (!product) {
    throw new Error(`Seeded product not found by name: "${name}". Got: ${products.map((p) => p.name).join(', ')}`);
  }
  return product;
}

function finish() {
  console.log('\n--- Summary ---');
  if (failures === 0) {
    console.log('ALL CHECKS PASSED');
  } else {
    console.log(`${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
  }
}

module.exports = {
  assert,
  req,
  assertServerReachable,
  resetAndSeed,
  findProductByName,
  finish,
  BASE,
  runDbTask,
  createExtraUser,
};
