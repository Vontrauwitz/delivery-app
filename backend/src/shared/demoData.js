const { ROLES } = require('./constants');

// Single source of truth for the demo dataset — used by both the safe `seed` script (idempotent,
// fills in only what's missing) and the destructive `db:reset` script (wipes and rebuilds this
// exact set). Keeping one copy avoids the two scripts silently drifting apart.
//
// `seedKey` is how the safe seed script recognizes "this is the same demo product" across
// repeated runs, independent of name/price/icon — so a manager renaming or repricing a demo
// product is never mistaken for it being missing and re-created alongside the edited one.
const PRODUCTS = [
  { seedKey: 'perro', name: 'Perro', icon: '🐕', basePrice: 45, order: 1 },
  { seedKey: 'raton', name: 'Ratón', icon: '🐭', basePrice: 25, order: 2 },
  { seedKey: 'leon', name: 'León', icon: '🦁', basePrice: 90, order: 3 },
  { seedKey: 'telarana', name: 'Telaraña', icon: '🕸️', basePrice: 20, order: 4 },
  { seedKey: 'grillo', name: 'Grillo', icon: '🦗', basePrice: 30, order: 5 },
  { seedKey: 'mariposa', name: 'Mariposa', icon: '🦋', basePrice: 35, order: 6 },
  { seedKey: 'pollo', name: 'Pollo', icon: '🐔', basePrice: 55, order: 7 },
  { seedKey: 'delfin', name: 'Delfín', icon: '🐬', basePrice: 75, order: 8 },
  { seedKey: 'nariz-de-puerco', name: 'Nariz de puerco', icon: '🐽', basePrice: 40, order: 9 },
  { seedKey: 'corona', name: 'Corona', icon: '👑', basePrice: 100, order: 10 },
];

// Fixed order for the first two entries: [manager, driver] — both seed.js and dbReset.js
// destructure those by position (`const [managerData, driverData] = DEMO_USERS`), and dbReset's
// minimal rebuild only ever recreates those two. Everything from index 2 onward is a
// supplementary demo driver, safe-seeded (see seed.js) but intentionally NOT part of db:reset's
// destructive rebuild — appending here is always safe since positional destructuring only reads
// the first two slots regardless of array length.
const DEMO_USERS = [
  { name: 'Manager Demo', email: 'manager@delivery.test', password: '123456', role: ROLES.MANAGER },
  { name: 'Driver Demo', email: 'driver@delivery.test', password: '123456', role: ROLES.DRIVER },
  { name: 'Driver Demo 1', email: 'driver1@delivery.test', password: '123456', role: ROLES.DRIVER },
  { name: 'Driver Demo 2', email: 'driver2@delivery.test', password: '123456', role: ROLES.DRIVER },
  { name: 'Driver Demo 3', email: 'driver3@delivery.test', password: '123456', role: ROLES.DRIVER },
];

const DEMO_VEHICLE_NAME = 'Carrito 1';

// The one demo promotion, keyed to the product it targets via seedKey (not name).
const GRILLO_PROMOTION = { productSeedKey: 'grillo', quantity: 2, bundlePrice: 50 };

module.exports = { PRODUCTS, DEMO_USERS, DEMO_VEHICLE_NAME, GRILLO_PROMOTION };
