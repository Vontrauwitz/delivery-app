const HttpError = require('../../shared/httpError');
const service = require('./products.service');

async function list(req, res, next) {
  try {
    const products = await service.listProducts();
    res.json(products);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const product = await service.getProductById(req.params.id);
    if (!product) return next(new HttpError(404, 'Producto no encontrado'));
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const product = await service.createProduct(req.body, req.user.id);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const product = await service.updateProduct(req.params.id, req.body, req.user.id);
    if (!product) return next(new HttpError(404, 'Producto no encontrado'));
    res.json(product);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const product = await service.deleteProduct(req.params.id, req.user.id);
    if (!product) return next(new HttpError(404, 'Producto no encontrado'));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, remove };
