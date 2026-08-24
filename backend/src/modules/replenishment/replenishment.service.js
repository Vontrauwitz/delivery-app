const Product = require('../products/product.model');
const Sale = require('../sales/sale.model');
const User = require('../users/user.model');
const InventorySession = require('../inventory/inventorySession.model');
const ReplenishmentConfig = require('./replenishmentConfig.model');
const HttpError = require('../../shared/httpError');
const round2 = require('../../shared/round2');
const inventoryService = require('../inventory/inventory.service');
const auditService = require('../audit/audit.service');
const {
  INVENTORY_AFFECTING_SALE_STATUSES,
  SESSION_STATUSES,
  ROLES,
  REPLENISHMENT_DEFAULTS,
  REPLENISHMENT_CONSUMPTION_WINDOW_SESSIONS,
  REPLENISHMENT_MIN_HISTORY_SESSIONS,
} = require('../../shared/constants');

// The formula itself: pure, no DB access, directly unit-testable.
// suggestedReplenishment = max(0, targetStock - currentStock)
// targetStock = averageDailyConsumption * coverageDays + safetyStock
function calculateSuggestion({ averageDailyConsumption, coverageDays, safetyStock, currentStock }) {
  const targetStock = round2(averageDailyConsumption * coverageDays + safetyStock);
  const suggestedReplenishment = round2(Math.max(0, targetStock - currentStock));
  return { targetStock, suggestedReplenishment };
}

async function getConfigMap(productIds) {
  const configs = await ReplenishmentConfig.find({ product: { $in: productIds } });
  return new Map(configs.map((c) => [String(c.product), c]));
}

function resolveConfig(productId, configMap) {
  const override = configMap.get(String(productId));
  return {
    coverageDays: override ? override.coverageDays : REPLENISHMENT_DEFAULTS.COVERAGE_DAYS,
    safetyStock: override ? override.safetyStock : REPLENISHMENT_DEFAULTS.SAFETY_STOCK,
    isOverride: !!override,
  };
}

// Consumption is summed from the driver's most recent CLOSED sessions only ("prefer completed
// historical sessions"): an in-progress OPEN session is a partial day and would understate a
// daily average. Only inventory-affecting sale statuses count (PENDING/APPROVED/INCIDENT) —
// CANCELLED sales never represent real consumption, same rule as expected-inventory elsewhere.
async function computeConsumptionByProduct(driverId) {
  const sessions = await InventorySession.find({ driver: driverId, status: SESSION_STATUSES.CLOSED })
    .sort({ businessDate: -1, createdAt: -1 })
    .limit(REPLENISHMENT_CONSUMPTION_WINDOW_SESSIONS)
    .select('_id');

  const sessionIds = sessions.map((s) => s._id);
  const sessionsUsed = sessionIds.length;
  const consumptionMap = new Map(); // productId -> total units sold across the window

  if (sessionsUsed > 0) {
    const sales = await Sale.find({
      inventorySession: { $in: sessionIds },
      status: { $in: INVENTORY_AFFECTING_SALE_STATUSES },
    }).select('items');

    for (const sale of sales) {
      for (const item of sale.items) {
        const key = String(item.product);
        consumptionMap.set(key, (consumptionMap.get(key) || 0) + item.quantity);
      }
    }
  }

  return { consumptionMap, sessionsUsed };
}

// Orchestrates: active products, recent consumption, current stock, per-product config, and
// applies the formula. Nothing is persisted — recomputed on demand every call, per PLAN.md.
async function getReplenishmentSuggestions(driverId) {
  const driver = await User.findById(driverId);
  if (!driver || driver.role !== ROLES.DRIVER) {
    throw new HttpError(404, 'Chofer no encontrado');
  }

  const products = await Product.find({ active: true }).sort({ name: 1 });
  if (products.length === 0) {
    return { stockSource: 'NONE', sessionsUsed: 0, insufficientHistory: true, rows: [] };
  }

  const [configMap, { consumptionMap, sessionsUsed }, { source: stockSource, stock: currentStockRows }] =
    await Promise.all([
      getConfigMap(products.map((p) => p._id)),
      computeConsumptionByProduct(driverId),
      inventoryService.getCurrentStockForDriver(driverId),
    ]);

  const currentStockMap = new Map(currentStockRows.map((r) => [String(r.product), r.quantityExpected]));
  const insufficientHistory = sessionsUsed < REPLENISHMENT_MIN_HISTORY_SESSIONS;

  const rows = products.map((product) => {
    const totalConsumption = consumptionMap.get(String(product._id)) || 0;
    // No history yet => 0, never invented — this is the "do not invent demand" rule.
    const averageDailyConsumption = sessionsUsed > 0 ? round2(totalConsumption / sessionsUsed) : 0;
    const currentStock = currentStockMap.has(String(product._id)) ? currentStockMap.get(String(product._id)) : 0;
    const { coverageDays, safetyStock, isOverride } = resolveConfig(product._id, configMap);
    const { targetStock, suggestedReplenishment } = calculateSuggestion({
      averageDailyConsumption,
      coverageDays,
      safetyStock,
      currentStock,
    });

    return {
      product: { _id: product._id, name: product.name, icon: product.icon, basePrice: product.basePrice },
      currentStock,
      totalConsumption,
      averageDailyConsumption,
      coverageDays,
      safetyStock,
      configIsOverride: isOverride,
      targetStock,
      suggestedReplenishment,
    };
  });

  return { stockSource, sessionsUsed, insufficientHistory, rows };
}

async function listConfig() {
  const products = await Product.find({ active: true }).sort({ name: 1 });
  const configMap = await getConfigMap(products.map((p) => p._id));

  return products.map((product) => {
    const { coverageDays, safetyStock, isOverride } = resolveConfig(product._id, configMap);
    return {
      product: { _id: product._id, name: product.name, icon: product.icon },
      coverageDays,
      safetyStock,
      isOverride,
    };
  });
}

async function setConfig(productId, { coverageDays, safetyStock }, managerId) {
  const product = await Product.findById(productId);
  if (!product) {
    throw new HttpError(404, 'Producto no encontrado');
  }

  const cd = Number(coverageDays);
  const ss = Number(safetyStock);
  if (!Number.isFinite(cd) || cd < 0) {
    throw new HttpError(400, 'coverageDays debe ser un número mayor o igual a 0');
  }
  if (!Number.isFinite(ss) || ss < 0) {
    throw new HttpError(400, 'safetyStock debe ser un número mayor o igual a 0');
  }

  const existing = await ReplenishmentConfig.findOne({ product: productId });
  const config = await ReplenishmentConfig.findOneAndUpdate(
    { product: productId },
    { coverageDays: cd, safetyStock: ss },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await auditService.logChange({
    entity: 'ReplenishmentConfig',
    entityId: config._id,
    action: existing ? 'UPDATE' : 'CREATE',
    changes: [
      { field: 'coverageDays', oldValue: existing ? existing.coverageDays : null, newValue: cd },
      { field: 'safetyStock', oldValue: existing ? existing.safetyStock : null, newValue: ss },
    ],
    performedBy: managerId,
  });

  return config;
}

async function resetConfig(productId, managerId) {
  const existing = await ReplenishmentConfig.findOneAndDelete({ product: productId });
  if (existing) {
    await auditService.logChange({
      entity: 'ReplenishmentConfig',
      entityId: existing._id,
      action: 'UPDATE',
      changes: [
        { field: 'coverageDays', oldValue: existing.coverageDays, newValue: null },
        { field: 'safetyStock', oldValue: existing.safetyStock, newValue: null },
      ],
      performedBy: managerId,
    });
  }
}

module.exports = {
  calculateSuggestion,
  computeConsumptionByProduct,
  getReplenishmentSuggestions,
  listConfig,
  setConfig,
  resetConfig,
};
