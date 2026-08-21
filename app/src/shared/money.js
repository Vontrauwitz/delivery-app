export function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value) {
  return `$${round2(value).toFixed(2)}`;
}
