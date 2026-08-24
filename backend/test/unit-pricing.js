// Pure, DB-free unit tests for the deterministic pricing engine (calculateLineSubtotal).
// This is the only place promotion math happens — no AI, no external calls, one pure function.
//
// Usage: node test/unit-pricing.js  (or: npm run test:unit:pricing)
// No backend server or DB connection required.

const assert = require('assert');
const { calculateLineSubtotal } = require('../src/shared/pricing');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

// --- No promotion at all: plain basePrice * quantity ---
check(calculateLineSubtotal(60, 1, null) === 60, 'no promotion: 1 unit = basePrice');
check(calculateLineSubtotal(60, 5, undefined) === 300, 'no promotion: 5 units = 5 * basePrice');

// --- Papas example from the spec: base $60, 2-for-$100 ---
const papasPromo = { quantity: 2, bundlePrice: 100 };
check(calculateLineSubtotal(60, 1, papasPromo) === 60, 'promo: 1 unit (below threshold) = basePrice = 60');
check(calculateLineSubtotal(60, 2, papasPromo) === 100, 'promo: exactly 2 units = bundlePrice = 100');
check(calculateLineSubtotal(60, 3, papasPromo) === 160, 'promo: 3 units = 1 bundle + 1 remainder = 100 + 60 = 160');
check(calculateLineSubtotal(60, 4, papasPromo) === 200, 'promo: 4 units = 2 bundles = 200');
check(calculateLineSubtotal(60, 5, papasPromo) === 260, 'promo: 5 units = 2 bundles + 1 remainder = 200 + 60 = 260');

// --- Zero quantity (defensive; buildItemsFromRequest never calls with 0, but the pure
// function itself should not misbehave if it ever is) ---
check(calculateLineSubtotal(60, 0, papasPromo) === 0, 'promo: 0 units = 0');

// --- A promotion object with no quantity is treated as no promotion, never crashes ---
check(calculateLineSubtotal(60, 3, {}) === 180, 'promotion without a quantity falls back to basePrice * quantity');

// --- Rounding stays clean with fractional base prices ---
check(calculateLineSubtotal(19.99, 3, null) === 59.97, 'no promotion: fractional basePrice rounds to 2 decimals');

// --- Promotions never mix across products: this function only ever sees ONE product's
// basePrice/quantity/promotion at a time, so two different products with different promotions
// (or one promoted, one not) can never influence each other's subtotal. Demonstrated by calling
// the function independently for each and confirming the results don't depend on each other. ---
const cocaSubtotal = calculateLineSubtotal(50, 3, null); // Coca has no promotion
const papasSubtotal = calculateLineSubtotal(60, 3, papasPromo); // Papas does
check(cocaSubtotal === 150, 'Coca (no promotion) prices at plain basePrice * quantity regardless of Papas having one');
check(papasSubtotal === 160, "Papas' own promotion still applies independently of Coca's line");

console.log('\n--- Summary ---');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
}

// Also assert with node's `assert` so this fails loudly (non-zero exit, stack trace) under any
// test runner that expects thrown assertions rather than just a printed summary.
assert.strictEqual(failures, 0, `${failures} pricing unit check(s) failed`);
