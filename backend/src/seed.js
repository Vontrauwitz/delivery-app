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

// SAFE to run repeatedly against a live/shared dev database: it only ever fills in what's
// missing (matched by a stable key, never by mutable fields like name/price), and never deletes
// or overwrites anything — including anything a manager created or edited by hand through the
// app. For a full destructive wipe-and-rebuild, use `npm run db:reset` instead.
async function seed() {
  await connectDB();

  const [managerData, driverData] = DEMO_USERS;

  let usersCreated = 0;
  async function ensureUser(data) {
    const existing = await User.findOne({ email: data.email });
    if (existing) return existing;
    usersCreated++;
    return createUser(data);
  }
  const manager = await ensureUser(managerData);
  const driver = await ensureUser(driverData);

  let productsCreated = 0;
  let productsAdopted = 0;
  const productsBySeedKey = {};
  for (const demo of PRODUCTS) {
    let existing = await Product.findOne({ seedKey: demo.seedKey });
    if (!existing) {
      // One-time migration shim: a database seeded before `seedKey` existed has these same demo
      // products but with no seedKey set. Adopt it by exact name match — set its seedKey so
      // future runs recognize it directly — instead of creating a duplicate. Only its seedKey
      // changes; name/price/icon/order/active (including any manual edits already made) are
      // left untouched. Once every product has a seedKey (or no longer matches a demo name),
      // this branch simply never matches again.
      existing = await Product.findOneAndUpdate(
        { name: demo.name, seedKey: { $exists: false } },
        { $set: { seedKey: demo.seedKey } },
        { new: true }
      );
      if (existing) productsAdopted++;
    }
    if (existing) {
      productsBySeedKey[demo.seedKey] = existing;
      continue;
    }
    productsBySeedKey[demo.seedKey] = await Product.create(demo);
    productsCreated++;
  }
  const grillo = productsBySeedKey[GRILLO_PROMOTION.productSeedKey];

  // Skip entirely if ANY promotion already exists for this product — active or not, demo or
  // manager-created — rather than risk creating a second one that conflicts with a manual edit.
  let promotionCreated = false;
  if (grillo) {
    const existingPromo = await Promotion.findOne({ product: grillo._id });
    if (!existingPromo) {
      await Promotion.create({
        product: grillo._id,
        type: PROMOTION_TYPES.QUANTITY_FOR_PRICE,
        quantity: GRILLO_PROMOTION.quantity,
        bundlePrice: GRILLO_PROMOTION.bundlePrice,
        active: true,
        createdBy: manager._id,
      });
      promotionCreated = true;
    }
  }

  let vehicleCreated = false;
  let vehicle = await Vehicle.findOne({ name: DEMO_VEHICLE_NAME });
  if (!vehicle) {
    vehicle = await Vehicle.create({ name: DEMO_VEHICLE_NAME, active: true, assignedDriver: driver._id });
    vehicleCreated = true;
  }

  // AccountingPeriod already enforces "at most one OPEN period" via a unique partial index —
  // this check just avoids an avoidable duplicate-key crash on a second run.
  let periodCreated = false;
  const openPeriod = await AccountingPeriod.findOne({ status: ACCOUNTING_PERIOD_STATUSES.OPEN });
  if (!openPeriod) {
    await AccountingPeriod.create({
      status: ACCOUNTING_PERIOD_STATUSES.OPEN,
      startedAt: new Date(),
      createdBy: manager._id,
    });
    periodCreated = true;
  }

  // Demo schedule for today, left unmatched until the driver actually starts a shift. Only
  // created if the driver doesn't already have one scheduled for today, so re-running seed
  // doesn't pile up duplicate demo schedules.
  let scheduleCreated = false;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date();
  dayEnd.setHours(23, 59, 59, 999);
  const existingSchedule = await ScheduledShift.findOne({
    driver: driver._id,
    scheduledStart: { $gte: dayStart, $lte: dayEnd },
  });
  if (!existingSchedule) {
    const scheduledStart = new Date();
    scheduledStart.setHours(9, 0, 0, 0);
    const scheduledEnd = new Date(scheduledStart.getTime() + 8 * 60 * 60 * 1000);
    await ScheduledShift.create({ driver: driver._id, scheduledStart, scheduledEnd, createdBy: manager._id });
    scheduleCreated = true;
  }

  console.log('Seed (no destructivo) completado — nada existente fue borrado ni modificado.');
  console.log(`  Usuarios demo nuevos: ${usersCreated} de ${DEMO_USERS.length} (el resto ya existía)`);
  console.log(`  Productos demo nuevos: ${productsCreated} de ${PRODUCTS.length} (el resto ya existía)`);
  if (productsAdopted > 0) {
    console.log(`  Productos demo adoptados (existían de antes de seedKey, sin duplicar): ${productsAdopted}`);
  }
  console.log(`  Promoción demo (Grillo 2x$50): ${promotionCreated ? 'creada' : 'omitida — ya existe una para ese producto'}`);
  console.log(`  Vehículo demo: ${vehicleCreated ? 'creado' : 'ya existía'}`);
  console.log(`  Período contable abierto: ${periodCreated ? 'creado' : 'ya existía uno'}`);
  console.log(`  Turno programado demo (hoy): ${scheduleCreated ? 'creado' : 'ya existía uno para hoy'}`);
  console.log('');
  console.log('Nota: el chofer debe iniciar turno (POST /work-shifts/start) para poder vender.');
  console.log('El inventario pertenece al chofer, no al vehículo, y es continuo: reponer stock');
  console.log('(POST /inventory-sessions/replenish) es la manera normal de dárselo — no hace falta');
  console.log('"abrir una sesión" manualmente, eso ocurre automáticamente si hace falta.');
  console.log('');
  console.log('Para un reinicio destructivo completo (borra TODO, incluyendo lo creado a mano):');
  console.log('  npm run db:reset');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error en seed', err);
  process.exit(1);
});
