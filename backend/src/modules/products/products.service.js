const Product = require('./product.model');

async function listProducts(filter = {}) {
  return Product.find(filter).sort({ createdAt: -1 });
}

async function getProductById(id) {
  return Product.findById(id);
}

async function createProduct(data) {
  return Product.create(data);
}

async function updateProduct(id, data) {
  return Product.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

async function deleteProduct(id) {
  return Product.findByIdAndDelete(id);
}

module.exports = { listProducts, getProductById, createProduct, updateProduct, deleteProduct };
