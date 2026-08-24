const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./modules/users/user.model');
const Product = require('./modules/products/product.model');
const Vehicle = require('./modules/vehicles/vehicle.model');
const Promotion = require('./modules/promotions/promotion.model');
const AccountingPeriod = require('./modules/accountingPeriods/accountingPeriod.model');
const ScheduledShift = require('./modules/scheduledShifts/scheduledShift.model');
const { createUser } = require('./modules/users/users.service');
const { ROLES, PROMOTION_TYPES, ACCOUNTING_PERIOD_STATUSES } = require('./shared/constants');

const PRODUCTS = [
  { name: 'Perro', icon: '🐕', basePrice: 45, order: 1 },
  { name: 'Ratón', icon: '🐭', basePrice: 25, order: 2 },
  { name: 'León', icon: '🦁', basePrice: 90, order: 3 },
  { name: 'Telaraña', icon: '🕸️', basePrice: 20, order: 4 },
  { name: 'Grillo', icon: '🦗', basePrice: 30, order: 5 },
  { name: 'Mariposa', icon: '🦋', basePrice: 35, order: 6 },
  { name: 'Pollo', icon: '🐔', basePrice: 55, order: 7 },
  { name: 'Delfín', icon: '🐬', basePrice: 75, order: 8 },
  { name: 'Nariz de puerco', icon: '🐽', basePrice: 40, order: 9 },
  { name: 'Corona', icon: '👑', basePrice: 100, order: 10 },
];

async function seed() {
  await connectDB();

  await User.deleteMany({});
  await Product.deleteMany({});
  await Vehicle.deleteMany({});
  await Promotion.deleteMany({});
  await AccountingPeriod.deleteMany({});
  await ScheduledShift.deleteMany({});

  const manager = await createUser({
    name: 'Manager Demo',
    email: 'manager@delivery.test',
    password: '123456',
    role: ROLES.MANAGER,
  });

  const driver = await createUser({
    name: 'Driver Demo',
    email: 'driver@delivery.test',
    password: '123456',
    role: ROLES.DRIVER,
  });

  const products = await Product.create(PRODUCTS);
  const grillo = products.find((p) => p.name === 'Grillo');

  await Promotion.create({
    product: grillo._id,
    type: PROMOTION_TYPES.QUANTITY_FOR_PRICE,
    quantity: 2,
    bundlePrice: 50,
    active: true,
    createdBy: manager._id,
  });

  const vehicle = await Vehicle.create({
    name: 'Carrito 1',
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
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const scheduledEnd = new Date(today.getTime() + 8 * 60 * 60 * 1000);
  await ScheduledShift.create({
    driver: driver._id,
    scheduledStart: today,
    scheduledEnd,
    createdBy: manager._id,
  });

  console.log('Seed completado: 1 manager, 1 driver, 1 vehículo, 10 productos, 1 promoción (Grillo 2x$50),');
  console.log('1 período contable abierto, 1 turno programado de ejemplo.');
  console.log('Nota: el chofer debe iniciar turno (POST /work-shifts/start) para poder vender.');
  console.log('El inventario pertenece al chofer, no al vehículo, y es continuo: reponer stock');
  console.log('(POST /inventory-sessions/replenish) es la manera normal de dárselo — no hace falta');
  console.log('"abrir una sesión" manualmente, eso ocurre automáticamente si hace falta.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error en seed', err);
  process.exit(1);
});
