const express = require('express');
const { login } = require('./auth.controller');
const { validateLogin } = require('./auth.validation');

const router = express.Router();

router.post('/login', validateLogin, login);

module.exports = router;
