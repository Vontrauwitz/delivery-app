import { round2 } from './money';

// Mirrors the backend's deterministic pricing engine (backend/src/shared/pricing.js) so the
// cart total updates instantly as the driver taps, with no network round trip per tap. This is
// NOT the source of truth — the backend always recomputes every line independently from the DB
// when the sale is actually created, exactly like it already does for unitPrice. A promotion
// only ever applies to units of the one product it targets.
export function calculateLineSubtotal(basePrice, quantity, promotion) {
  if (!promotion || !promotion.quantity || quantity < promotion.quantity) {
    return round2(basePrice * quantity);
  }

  const bundles = Math.floor(quantity / promotion.quantity);
  const remainder = quantity % promotion.quantity;
  return round2(bundles * promotion.bundlePrice + remainder * basePrice);
}
