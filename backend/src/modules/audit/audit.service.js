const AuditLog = require('./auditLog.model');

async function logChange({ entity, entityId, action, changes = [], performedBy }) {
  return AuditLog.create({ entity, entityId, action, changes, performedBy, performedAt: new Date() });
}

async function getHistory(entity, entityId) {
  return AuditLog.find({ entity, entityId })
    .sort({ performedAt: 1 })
    .populate('performedBy', 'name email role');
}

module.exports = { logChange, getHistory };
