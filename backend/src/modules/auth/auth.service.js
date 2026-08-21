const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const HttpError = require('../../shared/httpError');
const { findByEmail } = require('../users/users.service');

async function login(email, password) {
  const user = await findByEmail(email);
  if (!user || !user.active) {
    throw new HttpError(401, 'Credenciales inválidas');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new HttpError(401, 'Credenciales inválidas');
  }

  const token = jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

module.exports = { login };
