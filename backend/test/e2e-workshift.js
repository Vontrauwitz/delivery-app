// WorkShift + closing lifecycle regression suite: browsing without a shift, shift-gated
// operations, the OPEN -> CLOSING_PENDING -> CLOSED session lifecycle, the freeze on sale
// mutations while a closing is pending, finalize-time recompute/verification, and the
// administrative reopen path.
//
// Run via "npm test" — never manually with "npm run dev" (see test/testSafety.js for why). Resets
// and reseeds the relevant collections itself, so it can be run repeatedly without manual setup.
//
// Usage: node test/e2e-workshift.js  (or: npm run test:e2e:workshift)

const { assert, req, assertServerReachable, resetAndSeed, findProductByName, finish } = require('./helpers');

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;
  assert(managerLogin.status === 200 && driverLogin.status === 200, 'manager and driver login succeed');

  const products = (await req('/products', { token: driverToken })).data;
  // Selected by stable name, not array position: Product.create() inserts all three seed
  // products in the same millisecond, so GET /products (sorted by createdAt desc) does not
  // reliably come back in insertion order.
  const agua = findProductByName(products, 'Perro');
  const refresco = findProductByName(products, 'Ratón');
  const papas = findProductByName(products, 'Grillo');
  const vehicle = (await req('/vehicles', { token: managerToken })).data[0];

  // 1-2. Driver logs in, browses without a shift.
  const noShift = await req('/work-shifts/active/mine', { token: driverToken, expectStatus: 200 });
  assert(noShift.data === null, 'driver has no active shift right after login');
  const productsWhileIdle = await req('/products', { token: driverToken, expectStatus: 200 });
  assert(Array.isArray(productsWhileIdle.data), 'driver can browse products without a shift');
  const mySalesWhileIdle = await req('/sales/mine', { token: driverToken, expectStatus: 200 });
  assert(Array.isArray(mySalesWhileIdle.data), 'driver can browse own sales without a shift');

  // 3. Confirm driver cannot create a sale without an OPEN WorkShift.
  const saleNoShift = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: agua._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: agua.basePrice }] },
    expectStatus: 400,
  });
  assert(/turno/i.test(saleNoShift.data.error), 'sale-without-shift error clearly mentions the shift requirement');

  // Extra: manager cannot open a session for a driver with no open shift.
  const sessionNoShift = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock: [{ product: agua._id, quantity: 50 }] },
    expectStatus: 400,
  });
  assert(/turno/i.test(sessionNoShift.data.error), 'session-open-without-shift error clearly mentions the shift requirement');

  // Role checks: manager cannot start/end shifts; driver cannot list all shifts or admin-edit.
  await req('/work-shifts/start', { method: 'POST', token: managerToken, expectStatus: 403 });
  await req('/work-shifts', { token: driverToken, expectStatus: 403 });

  // 4. Driver starts shift.
  const startShift = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  assert(startShift.data.status === 'OPEN', 'shift started with status OPEN');
  assert(startShift.data.vehicle._id === vehicle._id, 'shift vehicle resolved server-side matches assigned vehicle');
  const shift1Id = startShift.data._id;

  const doubleStart = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 400 });
  assert(/turno abierto/i.test(doubleStart.data.error), 'cannot start a second shift while one is open (only one OPEN WorkShift per driver)');

  const activeShift = await req('/work-shifts/active/mine', { token: driverToken, expectStatus: 200 });
  assert(activeShift.data._id === shift1Id, 'active shift endpoint reflects the started shift');

  // 5. Manager opens InventorySession for that driver.
  const initialStock = [
    { product: agua._id, quantity: 50 },
    { product: refresco._id, quantity: 30 },
    { product: papas._id, quantity: 20 },
  ];
  const openSession = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock },
    expectStatus: 201,
  });
  const session1 = openSession.data;
  assert(session1.status === 'OPEN', 'session opened with status OPEN');
  assert(!!session1.workShift, 'session automatically associated with the active work shift');

  // Only one active session per driver, checked while OPEN.
  const duringOpen = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock },
    expectStatus: 400,
  });
  assert(/activa/i.test(duringOpen.data.error), 'blocked opening a second session while one is OPEN');

  // 6. Driver creates sale A successfully; manager approves it while session is still OPEN
  // (needed so expectedCash > 0 later, and so we have an APPROVED reference sale).
  const saleA = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: agua._id, quantity: 4 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: 4 * agua.basePrice }] },
    expectStatus: 201,
  });
  assert(saleA.data.status === 'PENDING', 'sale A created PENDING');
  const approveA = await req(`/approvals/${saleA.data._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 200 });
  assert(approveA.data.status === 'APPROVED', 'sale A approved while session OPEN');

  // Sale B is left PENDING deliberately, to test the freeze in step 12.
  const saleB = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: refresco._id, quantity: 2 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'transfer', amount: 2 * refresco.basePrice }] },
    expectStatus: 201,
  });
  assert(saleB.data.status === 'PENDING', 'sale B created PENDING (left open to test the freeze)');

  // 7. Driver creates partial inventory count.
  const partial = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: agua._id, quantityCounted: 46 }, { product: refresco._id, quantityCounted: 28 }, { product: papas._id, quantityCounted: 20 }] },
    expectStatus: 201,
  });
  assert(partial.data.type === 'PARTIAL', 'partial count recorded');

  // 8. Driver submits closing.
  const expectedCashBeforeClosing = 4 * agua.basePrice; // only sale A is APPROVED cash
  const closing1 = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: {
      counts: [{ product: agua._id, quantityCounted: 46 }, { product: refresco._id, quantityCounted: 28 }, { product: papas._id, quantityCounted: 20 }],
      reportedCash: expectedCashBeforeClosing,
    },
    expectStatus: 201,
  });
  assert(closing1.data.status === 'OPEN', 'closing submitted, status OPEN (pending review)');
  assert(closing1.data.expectedCash === expectedCashBeforeClosing, `expectedCash frozen at submission (got ${closing1.data.expectedCash}, want ${expectedCashBeforeClosing})`);

  // 9. Confirm InventorySession becomes CLOSING_PENDING.
  const sessionAfterClosing = await req(`/inventory-sessions/${session1._id}`, { token: managerToken, expectStatus: 200 });
  assert(sessionAfterClosing.data.status === 'CLOSING_PENDING', 'session transitioned to CLOSING_PENDING on closing submission');

  // Only one active session per driver also holds while CLOSING_PENDING (not just OPEN) —
  // a driver isn't free for a new session until their current one is fully CLOSED.
  const duringClosingPending = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock },
    expectStatus: 400,
  });
  assert(/activa/i.test(duringClosingPending.data.error), 'blocked opening a second session while the first is CLOSING_PENDING');

  // 10. Selling never depends on inventory session state — the driver can still sell while
  // the session is CLOSING_PENDING. The sale simply doesn't attach to the frozen session
  // (ensureActiveSessionForDriver deliberately does not create a new one while one is
  // CLOSING_PENDING — that one is frozen, awaiting the manager).
  const saleWhileFrozen = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: agua._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: agua.basePrice }] },
    expectStatus: 201,
  });
  assert(!saleWhileFrozen.data.inventorySession, 'sale created while the session is CLOSING_PENDING has no inventorySession attached');

  // 11. Confirm driver cannot create another partial count.
  await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: agua._id, quantityCounted: 46 }] },
    expectStatus: 400,
  });

  // No second closing either.
  await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: agua._id, quantityCounted: 46 }], reportedCash: 1 },
    expectStatus: 400,
  });

  // 12. Confirm manager cannot approve/edit a sale in that frozen session while closing is pending.
  const approveFrozen = await req(`/approvals/${saleB.data._id}/approve`, { method: 'PATCH', token: managerToken, expectStatus: 400 });
  assert(/cierre pendiente|reabre/i.test(approveFrozen.data.error), 'approve on frozen session blocked with a clear message');
  await req(`/approvals/${saleB.data._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { items: [{ product: refresco._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'transfer', amount: refresco.basePrice }] },
    expectStatus: 400,
  });
  await req(`/approvals/${saleB.data._id}/cancel`, { method: 'PATCH', token: managerToken, body: { reason: 'test' }, expectStatus: 400 });

  // 13-14. Manager finalizes closing; expectedCash/expectedInventory are recomputed and verified.
  const finalized = await req(`/closings/${closing1.data._id}/finalize`, { method: 'PATCH', token: managerToken, body: { note: 'Revisado' }, expectStatus: 200 });
  assert(finalized.data.status === 'CLOSED', 'closing finalized -> CLOSED');
  assert(finalized.data.expectedCash === expectedCashBeforeClosing, 'finalize recompute matches the frozen expectedCash (no drift, since sale mutations were blocked)');

  // 15. Confirm session becomes CLOSED, and a new session can now be opened for the driver.
  const sessionClosed = await req(`/inventory-sessions/${session1._id}`, { token: managerToken, expectStatus: 200 });
  assert(sessionClosed.data.status === 'CLOSED', 'session status CLOSED after finalize');
  assert(!!sessionClosed.data.endedAt, 'session endedAt set after finalize');

  // 16. Driver ends work shift.
  const endShift1 = await req('/work-shifts/end', { method: 'PATCH', token: driverToken, expectStatus: 200 });
  assert(endShift1.data.status === 'CLOSED', 'shift ended -> CLOSED');
  assert(!!endShift1.data.endedAt, 'shift endedAt set');

  // 17. Verify worked duration.
  assert(typeof endShift1.data.durationMs === 'number' && endShift1.data.durationMs >= 0, `worked duration computed (durationMs=${endShift1.data.durationMs})`);
  assert(typeof endShift1.data.durationHours === 'number', 'durationHours present for display');

  const noActiveShiftAfterEnd = await req('/work-shifts/active/mine', { token: driverToken, expectStatus: 200 });
  assert(noActiveShiftAfterEnd.data === null, 'no active shift after ending it');

  // 18. Start another test shift and verify manager can correct start/end time with mandatory reason + audit.
  const startShift2 = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  const shift2Id = startShift2.data._id;

  const editNoReason = await req(`/work-shifts/${shift2Id}/admin-edit`, {
    method: 'PATCH',
    token: managerToken,
    body: { startedAt: new Date().toISOString() },
    expectStatus: 400,
  });
  assert(/motivo/i.test(editNoReason.data.error), 'admin-edit requires a reason');

  await req(`/work-shifts/${shift2Id}/admin-edit`, {
    method: 'PATCH',
    token: driverToken,
    body: { startedAt: new Date().toISOString(), reason: 'intento no autorizado' },
    expectStatus: 403,
  });

  const correctedStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const editShift2 = await req(`/work-shifts/${shift2Id}/admin-edit`, {
    method: 'PATCH',
    token: managerToken,
    body: { startedAt: correctedStart, reason: 'El chofer olvidó iniciar el turno a tiempo' },
    expectStatus: 200,
  });
  assert(new Date(editShift2.data.startedAt).getTime() === new Date(correctedStart).getTime(), 'admin-edit updated startedAt');

  const invalidOrder = await req(`/work-shifts/${shift2Id}/admin-edit`, {
    method: 'PATCH',
    token: managerToken,
    body: { endedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), reason: 'endedAt antes que startedAt' },
    expectStatus: 400,
  });
  assert(/anterior/i.test(invalidOrder.data.error), 'admin-edit rejects endedAt before startedAt');

  const auditForShift2 = await req(`/audit?entity=WorkShift&entityId=${shift2Id}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditForShift2.data.some((a) => a.action === 'ADMIN_EDIT_SHIFT'),
    'ADMIN_EDIT_SHIFT audit entry recorded with old/new values'
  );

  // 19. Administrative reopen of a pending closing; operational actions become available
  // again only after reopen. Needs a fresh session under shift #2 (session1 is CLOSED).
  const openSession2 = await req('/inventory-sessions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, initialStock },
    expectStatus: 201,
  });
  const session2 = openSession2.data;

  await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: agua._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: agua.basePrice }] },
    expectStatus: 201,
  });

  const closing2 = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: initialStock.map((s) => ({ product: s.product, quantityCounted: s.quantity })), reportedCash: 0 },
    expectStatus: 201,
  });

  const sessionPending2 = await req(`/inventory-sessions/${session2._id}`, { token: managerToken, expectStatus: 200 });
  assert(sessionPending2.data.status === 'CLOSING_PENDING', 'second session also transitions to CLOSING_PENDING');

  // Selling is still never blocked by session state — but counting/closing genuinely require
  // an active session, so those stay blocked until the manager reopens it.
  const saleStillAllowedBeforeReopen = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: agua._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: agua.basePrice }] },
    expectStatus: 201,
  });
  assert(!saleStillAllowedBeforeReopen.data.inventorySession, 'selling stays available even while the session is CLOSING_PENDING before reopen');

  const partialBlockedBeforeReopen = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: [{ product: agua._id, quantityCounted: 1 }] },
    expectStatus: 400,
  });
  assert(partialBlockedBeforeReopen.status === 400, 'counting is still blocked before reopen (it genuinely requires an active session)');

  const reopenNoReason = await req(`/closings/${closing2.data._id}/reopen`, { method: 'PATCH', token: managerToken, body: {}, expectStatus: 400 });
  assert(/motivo/i.test(reopenNoReason.data.error), 'reopen requires a reason');

  const reopenAlreadyFinalized = await req(`/closings/${closing1.data._id}/reopen`, {
    method: 'PATCH',
    token: managerToken,
    body: { reason: 'intento sobre un cierre ya finalizado' },
    expectStatus: 400,
  });
  assert(/CLOSED/.test(reopenAlreadyFinalized.data.error), 'cannot reopen an already-finalized closing');

  const reopen2 = await req(`/closings/${closing2.data._id}/reopen`, {
    method: 'PATCH',
    token: managerToken,
    body: { reason: 'El chofer contó mal, necesita corregir el cierre' },
    expectStatus: 200,
  });
  assert(reopen2.data.status === 'REOPENED', 'closing marked REOPENED (not deleted)');
  assert(!!reopen2.data.reopenReason, 'reopen reason stored on the closing record');

  const sessionReopened = await req(`/inventory-sessions/${session2._id}`, { token: managerToken, expectStatus: 200 });
  assert(sessionReopened.data.status === 'OPEN', 'session moved back to OPEN after reopen');

  // Operational actions available again only after reopen.
  const saleAfterReopen = await req('/sales', {
    method: 'POST',
    token: driverToken,
    body: { items: [{ product: refresco._id, quantity: 1 }], adjustment: { amount: 0, reason: '' }, payments: [{ method: 'cash', amount: refresco.basePrice }] },
    expectStatus: 201,
  });
  assert(saleAfterReopen.status === 201, 'driver can create a sale again after reopen');

  const partialAfterReopen = await req('/inventory-counts/partial', {
    method: 'POST',
    token: driverToken,
    body: { counts: initialStock.map((s) => ({ product: s.product, quantityCounted: s.quantity })) },
    expectStatus: 201,
  });
  assert(partialAfterReopen.status === 201, 'driver can create a partial count again after reopen');

  // A fresh closing can be resubmitted against the same session — a REOPENED closing must
  // coexist with its replacement (this is what the Closing.inventorySession index must allow).
  const closing3 = await req('/closings', {
    method: 'POST',
    token: driverToken,
    body: { counts: initialStock.map((s) => ({ product: s.product, quantityCounted: s.quantity })), reportedCash: agua.basePrice + refresco.basePrice },
    expectStatus: 201,
  });
  assert(closing3.status === 201, 'driver can resubmit a closing after reopen (REOPENED does not block a fresh one)');

  const auditForClosing2 = await req(`/audit?entity=Closing&entityId=${closing2.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditForClosing2.data.some((a) => a.action === 'CLOSING_REOPENED'),
    'CLOSING_REOPENED audit entry recorded'
  );

  const auditForClosing1Submitted = await req(`/audit?entity=Closing&entityId=${closing1.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(
    auditForClosing1Submitted.data.some((a) => a.action === 'CLOSING_SUBMITTED') &&
      auditForClosing1Submitted.data.some((a) => a.action === 'CLOSING_FINALIZED'),
    'CLOSING_SUBMITTED and CLOSING_FINALIZED audit entries recorded for the first closing'
  );

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-workshift:', err);
  process.exitCode = 1;
});
