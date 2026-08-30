const mongoose = require('mongoose');
const { ALERT_SEVERITIES, OPERATIONAL_ALERT_STATUSES, ALERT_RULE_KEYS } = require('../../shared/constants');

// `type` mirrors `ruleKey` exactly for every rule in this checkpoint (kept as a separate field,
// per the domain design, so a future rule could someday produce more than one alert `type`
// without a schema change — not needed yet, so the two are always equal today).
const relatedEntitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    id: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

// A concrete alert occurrence produced by evaluating an AlertRule against current state (see
// alerts.service.evaluate). Never created directly by a client — always server-generated during
// evaluation. `metadata` is Mixed but, unlike a client-facing config field, is populated
// exclusively by trusted server code (never from request bodies), the same trust boundary
// AuditLog.changes[].oldValue/newValue already relies on — so Mixed here is a deliberate,
// contained choice, not an arbitrary-blob loophole.
const operationalAlertSchema = new mongoose.Schema(
  {
    ruleKey: { type: String, enum: Object.values(ALERT_RULE_KEYS), required: true },
    type: { type: String, required: true },
    severity: { type: String, enum: Object.values(ALERT_SEVERITIES), required: true },
    status: {
      type: String,
      enum: Object.values(OPERATIONAL_ALERT_STATUSES),
      default: OPERATIONAL_ALERT_STATUSES.OPEN,
    },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    relatedEntity: { type: relatedEntitySchema, default: null },
    dedupeKey: { type: String, required: true },
    // True while OPEN or ACKNOWLEDGED, false once RESOLVED — exists purely to back the partial
    // unique index below with a plain equality filter (partialFilterExpression only reliably
    // supports equality/$exists/comparison operators, not $in/$ne), mirroring WorkShift's own
    // "one OPEN shift per driver" partial index pattern one-for-one.
    active: { type: Boolean, default: true },
    firstTriggeredAt: { type: Date, required: true, default: Date.now },
    lastTriggeredAt: { type: Date, required: true, default: Date.now },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Enforces "no duplicate active alert for the same condition" at the DB level, not just in
// service logic — a second evaluate() racing to create the same still-active condition hits this
// instead of silently duplicating (see alerts.service's E11000 handling).
operationalAlertSchema.index({ dedupeKey: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
operationalAlertSchema.index({ status: 1, severity: 1 });
operationalAlertSchema.index({ ruleKey: 1, active: 1 });
operationalAlertSchema.index({ driver: 1 });

module.exports = mongoose.model('OperationalAlert', operationalAlertSchema);
