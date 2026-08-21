const { execSync } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');

const BACKEND_ROOT = path.join(__dirname, '..');
const BASE = process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/delivery-app';

let failures = 0;

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

// Clears the collections seed.js doesn't touch itself (Sale/InventorySession/InventoryCount/
// Closing/WorkShift/AuditLog/ReplenishmentConfig/LocationPing/Message/Dispatch), then re-runs
// the normal seed script for a clean, deterministic starting point: 1 manager, 1 driver, 1
// vehicle assigned to the driver, 3 products.
async function resetAndSeed() {
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
  await mongoose.disconnect();

  execSync('node src/seed.js', { cwd: BACKEND_ROOT, stdio: 'ignore' });
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
