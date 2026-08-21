const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./modules/users/user.model');
const Product = require('./modules/products/product.model');
const { createUser } = require('./modules/users/users.service');
const { ROLES } = require('./shared/constants');

async function seed() {
  await connectDB();

  await User.deleteMany({});
  await Product.deleteMany({});

  await createUser({
    name: 'Manager Demo',
    email: 'manager@delivery.test',
    password: '123456',
    role: ROLES.MANAGER,
  });

  await createUser({
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

  console.log('Seed completado: 1 manager, 1 driver, 3 productos.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Error en seed', err);
  process.exit(1);
});
