// Promotions regression suite: CRUD + permissions for the Promotion model, the "only one
// active promotion per product" invariant, and end-to-end pricing integration through real
// Sale creation — promo pricing, no cross-product mixing, cash/transfer/mixed payment totals,
// final-total adjustment (with the reason-required rule), and that manager approval is still
// required regardless of how the sale was priced.
//
// Requires the backend to be running (npm run dev) against the configured MONGO_URI. Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-promotions.js  (or: npm run test:e2e:promotions)

const { assert, req, assertServerReachable, resetAndSeed, findProductByName, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  assert(managerLogin.status === 200 && driverLogin.status === 200, 'manager and driver login succeed');

  const products = (await req('/products', { token: driverToken })).data;
  const coca = findProductByName(products, 'Perro');
  const papas = findProductByName(products, 'Grillo');
  const chocoroles = findProductByName(products, 'Ratón');

  // --- Seed already created Grillo 2x$50 (active) ---
  const seeded = await req(`/promotions?product=${papas._id}&active=true`, { token: managerToken, expectStatus: 200 });
  assert(seeded.data.length === 1, 'seed created exactly 1 active promotion for Grillo');
  const seededPromo = seeded.data[0];
  assert(seededPromo.type === 'QUANTITY_FOR_PRICE', 'seeded promotion has type QUANTITY_FOR_PRICE');
  assert(seededPromo.quantity === 2 && seededPromo.bundlePrice === 50, 'seeded promotion is 2 for $50');

  // --- Permissions: driver can read, but not write ---
  await req('/promotions', { token: driverToken, expectStatus: 200 });
  await req('/promotions', {
    method: 'POST',
    token: driverToken,
    body: { product: coca._id, quantity: 3, bundlePrice: 120 },
    expectStatus: 403,
  });
  await req(`/promotions/${seededPromo._id}`, { method: 'PUT', token: driverToken, body: { bundlePrice: 90 }, expectStatus: 403 });
  await req(`/promotions/${seededPromo._id}/deactivate`, { method: 'PATCH', token: driverToken, expectStatus: 403 });

  // --- Validation: quantity must be an integer >= 2, bundlePrice must be a number >= 0 ---
  await req('/promotions', { method: 'POST', token: managerToken, body: { product: coca._id, quantity: 1, bundlePrice: 80 }, expectStatus: 400 });
  await req('/promotions', { method: 'POST', token: managerToken, body: { product: coca._id, quantity: 2, bundlePrice: -5 }, expectStatus: 400 });
  await req('/promotions', { method: 'POST', token: managerToken, body: { product: coca._id, quantity: 2.5, bundlePrice: 80 }, expectStatus: 400 });

  // --- Only one ACTIVE promotion per product: creating a second for Papas while the first is
  // active is rejected ---
  const conflict = await req('/promotions', {
    method: 'POST',
    token: managerToken,
    body: { product: papas._id, quantity: 3, bundlePrice: 150 },
    expectStatus: 400,
  });
  assert(/activa/i.test(conflict.data.error), 'creating a second active promotion for the same product is rejected with a clear message');

  // --- Manager creates a promotion for Perro (2 for $80) ---
  const created = await req('/promotions', {
    method: 'POST',
    token: managerToken,
    body: { product: coca._id, quantity: 2, bundlePrice: 80 },
    expectStatus: 201,
  });
  assert(created.data.active === true, 'newly created promotion is active by default');
  assert(created.data.createdBy._id === managerLogin.data.user.id, 'createdBy is the manager who created it');
  const cocaPromoId = created.data._id;

  // --- Manager edits quantity/bundlePrice ---
  const edited = await req(`/promotions/${cocaPromoId}`, {
    method: 'PUT',
    token: managerToken,
    body: { quantity: 3, bundlePrice: 120 },
    expectStatus: 200,
  });
  assert(edited.data.quantity === 3 && edited.data.bundlePrice === 120, 'promotion edited to 3 for $120');

  // --- Deactivate, then reactivating a conflicting one is blocked, but reactivating itself works ---
  const deactivated = await req(`/promotions/${cocaPromoId}/deactivate`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(deactivated.data.active === false, 'promotion deactivated');

  const secondCocaPromo = await req('/promotions', {
    method: 'POST',
    token: managerToken,
    body: { product: coca._id, quantity: 4, bundlePrice: 150 },
    expectStatus: 201,
  });
  assert(secondCocaPromo.status === 201, 'a new active promotion can be created for Coca now that the old one is inactive');

  const reactivateConflict = await req(`/promotions/${cocaPromoId}/activate`, { method: 'PATCH', token: managerToken, expectStatus: 400 });
  assert(/activa/i.test(reactivateConflict.data.error), 'reactivating the old Coca promotion is blocked while the new one is active');

  await req(`/promotions/${secondCocaPromo.data._id}/deactivate`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  const reactivated = await req(`/promotions/${cocaPromoId}/activate`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(reactivated.data.active === true, 'original Coca promotion reactivated now that the conflicting one is inactive');

  // Deactivate again so it doesn't interfere with the pricing checks below (only Papas should
  // be promoted for the rest of this run).
  await req(`/promotions/${cocaPromoId}/deactivate`, { method: 'PATCH', token: managerToken, expectStatus: 200 });

  // ============================================================================
  // Sale-level pricing integration
  // ============================================================================

  await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverLogin.data.user.id,
      initialStock: [
        { product: coca._id, quantity: 100 },
        { product: papas._id, quantity: 100 },
        { product: chocoroles._id, quantity: 100 },
      ],
    },
    expectStatus: 201,
  });

  // --- A sale mixing a promoted product (Grillo, qty 3 -> 80) with a non-promoted product
  // (Perro, qty 2, no active promo right now -> 2*45=90) must price each line independently:
  // no cross-product mixing, ever. ---
  const subtotal = 80 + 90; // 170
  const mixedProductsSale = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [
        { product: papas._id, quantity: 3 },
        { product: coca._id, quantity: 2 },
      ],
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: subtotal }],
    },
    expectStatus: 201,
  });
  const papasLine = mixedProductsSale.data.items.find((i) => i.product._id === papas._id);
  const cocaLine = mixedProductsSale.data.items.find((i) => i.product._id === coca._id);
  assert(papasLine.subtotal === 80, `Grillo line priced via its own promotion (3 units = 50 + 30, got ${papasLine.subtotal})`);
  assert(cocaLine.subtotal === 90, `Perro line priced at plain basePrice * quantity, unaffected by Grillo's promotion (got ${cocaLine.subtotal})`);
  assert(mixedProductsSale.data.subtotalOriginal === subtotal, `sale subtotal is the sum of independently-priced lines (got ${mixedProductsSale.data.subtotalOriginal}, want ${subtotal})`);

  // --- CASH with the computed total unchanged: no adjustment, no reason needed ---
  const cashSale = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: papas._id, quantity: 2 }], // promo: 2 for 50
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'cash', amount: 50 }],
    },
    expectStatus: 201,
  });
  assert(cashSale.data.totalFinal === 50, 'cash sale total matches the promo-priced subtotal with no adjustment');
  assert(cashSale.data.status === 'PENDING', 'cash sale is created PENDING, not auto-approved');

  // --- CASH with an overridden final total ("total charged") requires a reason, and the
  // difference becomes the adjustment ---
  const cashOverrideNoReason = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: papas._id, quantity: 2 }], // subtotal 50
      adjustment: { amount: -10, reason: '' }, // driver only charged 40
      payments: [{ method: 'cash', amount: 40 }],
    },
    expectStatus: 400,
  });
  assert(/motivo/i.test(cashOverrideNoReason.data.error), 'overriding the final total without a reason is rejected');

  const cashOverrideWithReason = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: papas._id, quantity: 2 }], // subtotal 50
      adjustment: { amount: -10, reason: 'Cliente no traía cambio' },
      payments: [{ method: 'cash', amount: 40 }],
    },
    expectStatus: 201,
  });
  assert(cashOverrideWithReason.data.totalFinal === 40, 'final total reflects the driver-adjusted amount (50 - 10 = 40)');
  assert(cashOverrideWithReason.data.adjustment.reason === 'Cliente no traía cambio', 'adjustment reason is stored');

  // --- TRANSFER uses the calculated total as-is, no adjustment involved ---
  const transferSale = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: chocoroles._id, quantity: 3 }], // 3 * 25 = 75, no promo
      adjustment: { amount: 0, reason: '' },
      payments: [{ method: 'transfer', amount: 75 }],
    },
    expectStatus: 201,
  });
  assert(transferSale.data.totalFinal === 75, 'transfer sale total is the plain computed subtotal');
  assert(transferSale.data.payments.length === 1 && transferSale.data.payments[0].method === 'transfer', 'transfer sale has a single transfer payment for the full total');

  // --- MIXED: cash + transfer must sum exactly to the computed total ---
  const mixedMismatch = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: coca._id, quantity: 4 }], // 4 * 45 = 180, no active promo
      adjustment: { amount: 0, reason: '' },
      payments: [
        { method: 'cash', amount: 50 },
        { method: 'transfer', amount: 100 }, // sums to 150, not 180
      ],
    },
    expectStatus: 400,
  });
  assert(/suma de los pagos/i.test(mixedMismatch.data.error), 'mismatched mixed payment split is rejected');

  const mixedOk = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: {
      items: [{ product: coca._id, quantity: 4 }], // 180
      adjustment: { amount: 0, reason: '' },
      payments: [
        { method: 'cash', amount: 80 },
        { method: 'transfer', amount: 100 },
      ],
    },
    expectStatus: 201,
  });
  assert(mixedOk.data.totalFinal === 180, 'mixed sale total matches computed subtotal');
  const mixedCash = mixedOk.data.payments.find((p) => p.method === 'cash');
  const mixedTransfer = mixedOk.data.payments.find((p) => p.method === 'transfer');
  assert(mixedCash.amount === 80 && mixedTransfer.amount === 100, 'mixed sale keeps both payment amounts as submitted');

  // --- Manager approval is still required, regardless of how the sale was priced/paid ---
  for (const sale of [cashSale.data, cashOverrideWithReason.data, transferSale.data, mixedOk.data]) {
    assert(sale.status === 'PENDING', `sale ${sale._id} starts PENDING and is not auto-approved by pricing/payment mode`);
  }

  const pending = await req('/approvals/pending', { token: managerToken, expectStatus: 200 });
  const pendingIds = pending.data.map((s) => s._id);
  assert(
    [cashSale.data._id, cashOverrideWithReason.data._id, transferSale.data._id, mixedOk.data._id].every((id) => pendingIds.includes(id)),
    'all sales created above are visible in the manager pending-approval queue'
  );

  const approved = await req(`/approvals/${cashSale.data._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(approved.data.status === 'APPROVED', 'manager can still approve a promo-priced sale explicitly');
  assert(approved.data.approval.approvedBy._id === managerLogin.data.user.id, 'approval records who approved it');

  // Driver cannot self-approve — approval is manager/admin only, unaffected by pricing changes.
  await req(`/approvals/${transferSale.data._id}/approve`, { method: 'PATCH', token: driverToken, expectStatus: 403 });

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-promotions:', err);
  process.exitCode = 1;
});
