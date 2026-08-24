const round2 = require('./round2');

// Deterministic pricing engine — pure function, no external calls, no AI involved.
// A QUANTITY_FOR_PRICE promotion bundles `promotion.quantity` units of ONE product for a flat
// `promotion.bundlePrice`; any remainder below that threshold is priced at basePrice. This never
// looks at other products, so promotions can never be combined across different products.
function calculateLineSubtotal(basePrice, quantity, promotion) {
  if (!promotion || !promotion.quantity || quantity < promotion.quantity) {
    return round2(basePrice * quantity);
  }

  const bundles = Math.floor(quantity / promotion.quantity);
  const remainder = quantity % promotion.quantity;
  return round2(bundles * promotion.bundlePrice + remainder * basePrice);
}

module.exports = { calculateLineSubtotal };
