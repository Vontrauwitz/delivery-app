const express = require('express');
const cors = require('cors');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const productsRoutes = require('./modules/products/products.routes');
const salesRoutes = require('./modules/sales/sales.routes');
const approvalsRoutes = require('./modules/approvals/approvals.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/products', productsRoutes);
app.use('/sales', salesRoutes);
app.use('/approvals', approvalsRoutes);
app.use('/audit', auditRoutes);

app.use(errorHandler);

module.exports = app;
