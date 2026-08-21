// Pure, DB-free unit tests: the replenishment formula itself, and a regression guard that
// Product never grows an inventory/stock field (Phase 3 explicitly forbids this — inventory
// state lives in InventorySession/InventoryCount, never on Product).
//
// Usage: node test/unit-replenishment.js  (or: npm run test:unit:replenishment)
// No backend server or DB connection required.

const assert = require('assert');
const { calculateSuggestion } = require('../src/modules/replenishment/replenishment.service');
const Product = require('../src/modules/products/product.model');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:', msg);
  }
}

// --- calculateSuggestion: targetStock = avgDaily * coverageDays + safetyStock ---
// --- suggestedReplenishment = max(0, targetStock - currentStock) ---

{
  const { targetStock, suggestedReplenishment } = calculateSuggestion({
    averageDailyConsumption: 10,
    coverageDays: 3,
    safetyStock: 5,
    currentStock: 20,
  });
  check(targetStock === 35, `target = avgDaily*coverageDays + safetyStock (got ${targetStock}, want 35)`);
  check(suggestedReplenishment === 15, `suggested = target - currentStock (got ${suggestedReplenishment}, want 15)`);
}

{
  // currentStock already exceeds target -> must clamp to 0, never negative.
  const { suggestedReplenishment } = calculateSuggestion({
    averageDailyConsumption: 1,
    coverageDays: 1,
    safetyStock: 0,
    currentStock: 100,
  });
  check(suggestedReplenishment === 0, `suggested never goes below zero when overstocked (got ${suggestedReplenishment})`);
  check(suggestedReplenishment >= 0, 'suggested is always >= 0');
}

{
  // No consumption history and no safety stock -> target is 0, nothing to suggest.
  const { targetStock, suggestedReplenishment } = calculateSuggestion({
    averageDailyConsumption: 0,
    coverageDays: 3,
    safetyStock: 0,
    currentStock: 0,
  });
  check(targetStock === 0, 'zero consumption and zero safety stock -> target is 0 (no demand invented)');
  check(suggestedReplenishment === 0, 'nothing suggested when there is no demand and no current stock');
}

{
  // safetyStock alone can still drive a positive suggestion even with zero measured consumption.
  const { targetStock, suggestedReplenishment } = calculateSuggestion({
    averageDailyConsumption: 0,
    coverageDays: 3,
    safetyStock: 8,
    currentStock: 2,
  });
  check(targetStock === 8, 'safety stock alone sets the target when there is no measured consumption');
  check(suggestedReplenishment === 6, `suggested = safetyStock - currentStock here (got ${suggestedReplenishment}, want 6)`);
}

{
  // Fuzz a spread of inputs — suggestedReplenishment must never be negative, regardless of inputs.
  let sawPositive = false;
  for (let avg = 0; avg <= 5; avg += 1) {
    for (let coverage = 0; coverage <= 5; coverage += 1) {
      for (let safety = 0; safety <= 5; safety += 1) {
        for (let stock = 0; stock <= 50; stock += 5) {
          const { suggestedReplenishment } = calculateSuggestion({
            averageDailyConsumption: avg,
            coverageDays: coverage,
            safetyStock: safety,
            currentStock: stock,
          });
          if (suggestedReplenishment > 0) sawPositive = true;
          if (suggestedReplenishment < 0) {
            failures++;
            console.error(
              `FAIL: negative suggestion for avg=${avg} coverage=${coverage} safety=${safety} stock=${stock} -> ${suggestedReplenishment}`
            );
          }
        }
      }
    }
  }
  check(sawPositive, 'fuzz sweep produced at least one positive suggestion (sanity check the sweep is meaningful)');
  console.log('OK: fuzz sweep of calculateSuggestion never produced a negative value');
}

// --- Regression guard: Product must never grow an inventory/stock field ---
{
  const disallowed = ['stock', 'inventory', 'currentstock', 'quantity', 'quantityonhand'];
  const paths = Object.keys(Product.schema.paths).map((p) => p.toLowerCase());
  const offenders = paths.filter((p) => disallowed.some((d) => p.includes(d)));
  check(
    offenders.length === 0,
    `Product schema has no inventory/stock field (found paths: ${paths.join(', ')})`
  );
}

console.log('\n--- Summary ---');
if (failures === 0) {
  console.log('ALL CHECKS PASSED');
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exitCode = 1;
}
