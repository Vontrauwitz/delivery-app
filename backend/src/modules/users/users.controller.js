const HttpError = require('../../shared/httpError');
const { findById, listUsers } = require('./users.service');

async function getMe(req, res, next) {
  try {
    const user = await findById(req.user.id);
    if (!user) return next(new HttpError(404, 'Usuario no encontrado'));
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, list };
