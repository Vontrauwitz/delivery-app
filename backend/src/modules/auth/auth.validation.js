const HttpError = require('../../shared/httpError');

function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new HttpError(400, 'Email y password son requeridos'));
  }

  next();
}

module.exports = { validateLogin };
