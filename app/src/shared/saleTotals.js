import { round2 } from './money';

// The final sale total is a single concept, independent of payment method — the driver (or
// manager, on review) edits it once, and any difference from the calculated subtotal is an
// adjustment. This is the one place both the driver POS screen and the manager review/edit
// screen compute it, so the two screens can never drift apart, and so payment-method selection
// can never gate the ability to adjust the total.

// An empty input means "use the calculated subtotal as-is" — not zero.
export function resolveFinalTotal(finalTotalInput, subtotal) {
  if (finalTotalInput === '') {
    return subtotal;
  }
  return round2(Number(finalTotalInput) || 0);
}

export function computeAdjustment(finalTotal, subtotal) {
  const amount = round2(finalTotal - subtotal);
  return { amount, needsReason: amount !== 0 };
}

// CASH and TRANSFER always follow the final total automatically — the driver never enters a
// separate payment amount for those. Only MIXED requires (and allows) a manual split, built by
// the caller from its own cash/transfer inputs.
export function buildAutoPayments(paymentMode, finalTotal) {
  if (paymentMode === 'CASH') {
    return [{ method: 'cash', amount: finalTotal }];
  }
  if (paymentMode === 'TRANSFER') {
    return [{ method: 'transfer', amount: finalTotal }];
  }
  return null;
}

// The convenient MIXED remainder auto-fill: editing one side fills the other with whatever is
// needed to reach the final total. Returns null when the typed value alone already exceeds the
// final total, so the caller can leave the other field as the driver left it.
export function computeMixedRemainder(finalTotal, changedValue) {
  const remainder = round2(finalTotal - changedValue);
  return remainder >= 0 ? remainder : null;
}
