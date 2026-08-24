const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./modules/users/user.model');
const Product = require('./modules/products/product.model');
const Vehicle = require('./modules/vehicles/vehicle.model');
const Promotion = require('./modules/promotions/promotion.model');
const AccountingPeriod = require('./modules/accountingPeriods/accountingPeriod.model');
const ScheduledShift = require('./modules/scheduledShifts/scheduledShift.model');
const { createUser } = require('./modules/users/users.service');
const { PROMOTION_TYPES, ACCOUNTING_PERIOD_STATUSES } = require('./shared/constants');
const { PRODUCTS, DEMO_USERS, DEMO_VEHICLE_NAME, GRILLO_PROMOTION } = require('./shared/demoData');

// ============================================================================================
// DESTRUCTIVE — this script wipes development data.
//
// `npm run db:reset` deletes ALL users, products (including anything created or edited by hand
// through the app — e.g. a manually-added product), vehicles, promotions, accounting periods,
// and scheduled shifts, then rebuilds the fixed demo dataset from scratch.
//
// This is the ONLY workflow allowed to wipe development data. Everyday seeding should use
// `npm run seed` instead, which is non-destructive and safe to run repeatedly against a live
// dev database — it only fills in what's missing and never touches existing data.
//
// Only run this when a genuinely clean slate is wanted and it's fine to lose anything manually
// created or edited since the last reset.
// ============================================================================================
async function dbReset() {
  console.log('⚠️  DESTRUCTIVE RESET — wiping and rebuilding all development data (users, products,');
  console.log('   vehicles, promotions, accounting periods, scheduled shifts). Anything created or');
  console.log('   edited by hand — including manually-added products — will be permanently lost.');
  console.log('');

  await connectDB();

  await User.deleteMany({});
  await Product.deleteMany({});
  await Vehicle.deleteMany({});
  await Promotion.deleteMany({});
  await AccountingPeriod.deleteMany({});
  await ScheduledShift.deleteMany({});

  const [managerData, driverData] = DEMO_USERS;
  const manager = await createUser(managerData);
  const driver = await createUser(driverData);

  const products = await Product.create(PRODUCTS);
  const grillo = products.find((p) => p.seedKey === GRILLO_PROMOTION.productSeedKey);

  await Promotion.create({
    product: grillo._id,
    type: PROMOTION_TYPES.QUANTITY_FOR_PRICE,
    quantity: GRILLO_PROMOTION.quantity,
    bundlePrice: GRILLO_PROMOTION.bundlePrice,
    active: true,
    createdBy: manager._id,
  });

  await Vehicle.create({
    name: DEMO_VEHICLE_NAME,
    active: true,
    assignedDriver: driver._id,
  });

  await AccountingPeriod.create({
    status: ACCOUNTING_PERIOD_STATUSES.OPEN,
    startedAt: new Date(),
    createdBy: manager._id,
  });

  // Demo schedule for today, left unmatched until the driver actually starts a shift (matching
  // happens once, at WorkShift-start time — see workShifts.service.startShift).
  const scheduledStart = new Date();
  scheduledStart.setHours(9, 0, 0, 0);
  const scheduledEnd = new Date(scheduledStart.getTime() + 8 * 60 * 60 * 1000);
  await ScheduledShift.create({
    driver: driver._id,
    scheduledStart,
    scheduledEnd,
    createdBy: manager._id,
  });

  console.log('Reset completado: 1 manager, 1 driver, 1 vehículo, 10 productos, 1 promoción (Grillo 2x$50),');
  console.log('1 período contable abierto, 1 turno programado de ejemplo.');
  console.log('Todo lo que existía antes de este reset fue eliminado permanentemente.');
  await mongoose.disconnect();
}

dbReset().catch((err) => {
  console.error('Error en db:reset', err);
  process.exit(1);
});
