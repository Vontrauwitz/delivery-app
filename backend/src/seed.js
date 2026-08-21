const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./modules/users/user.model');
const Product = require('./modules/products/product.model');
const Vehicle = require('./modules/vehicles/vehicle.model');
const Sale = require('./modules/sales/sale.model');
const { createUser } = require('./modules/users/users.service');
const { ROLES } = require('./shared/constants');

async function seed() {
  await connectDB();

  await User.deleteMany({});
  await Product.deleteMany({});
  await Vehicle.deleteMany({});

  await createUser({
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

  await Product.create([
    { name: 'Agua 600ml', icon: '💧', basePrice: 15 },
    { name: 'Refresco', icon: '🥤', basePrice: 20 },
    { name: 'Papas fritas', icon: '🍟', basePrice: 25 },
  ]);

  const vehicle = await Vehicle.create({
    name: 'Carrito 1',
    active: true,
    assignedDriver: driver._id,
  });

  // Legacy sales created before the Vehicle/InventorySession concepts existed won't have
  // a `vehicle` field. Associate them with the seeded vehicle instead of leaving them orphaned.
  // (They still won't have an `inventorySession`, since none of the old sessions exist anymore —
  // that's fine for stale dev data, but see PLAN deviations for the caveat.)
  const backfillResult = await Sale.updateMany({ vehicle: { $exists: false } }, { $set: { vehicle: vehicle._id } });
  if (backfillResult.modifiedCount > 0) {
    console.log(`Se asociaron ${backfillResult.modifiedCount} venta(s) previa(s) al vehículo de prueba.`);
  }

  console.log('Seed completado: 1 manager, 1 driver, 1 vehículo (asignado al driver), 3 productos.');
  console.log('Nota: el chofer debe iniciar turno (POST /work-shifts/start) y el manager debe abrir');
  console.log('una InventorySession (POST /inventory-sessions) antes de poder vender.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error en seed', err);
  process.exit(1);
});
