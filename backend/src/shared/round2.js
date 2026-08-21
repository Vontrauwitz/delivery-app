function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = round2;
