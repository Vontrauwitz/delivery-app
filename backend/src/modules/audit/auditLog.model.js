const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  entity: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: {
    type: String,
    enum: [
      'CREATE',
      'UPDATE',
      'REPLENISH',
      'APPROVE',
      'CANCEL',
      'MARK_INCIDENT',
      'CLOSE',
      'START_SHIFT',
      'END_SHIFT',
      'ADMIN_EDIT_SHIFT',
      'ADMIN_CLOSE_SHIFT',
      'CLOSING_SUBMITTED',
      'CLOSING_REOPENED',
      'CLOSING_FINALIZED',
      'ACTIVATE',
      'DEACTIVATE',
      'DELETE',
      'DELETE_BLOCKED',
    ],
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
