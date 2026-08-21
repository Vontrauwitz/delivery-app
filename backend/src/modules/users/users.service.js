const bcrypt = require('bcryptjs');
const User = require('./user.model');

async function findByEmail(email) {
  return User.findOne({ email: email.toLowerCase().trim() });
}

async function findById(id) {
  return User.findById(id).select('-passwordHash');
}

async function createUser({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return User.create({ name, email, passwordHash, role });
}

async function listUsers(filter = {}) {
  return User.find(filter).select('-passwordHash');
}

module.exports = { findByEmail, findById, createUser, listUsers };
