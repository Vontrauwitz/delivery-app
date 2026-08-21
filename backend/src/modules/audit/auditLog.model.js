const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  entity: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'APPROVE', 'CANCEL', 'MARK_INCIDENT', 'CLOSE'],
    required: true,
  },
  changes: [
    {
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      _id: false,
    },
  ],
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
