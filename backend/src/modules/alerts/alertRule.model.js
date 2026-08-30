const mongoose = require('mongoose');
const { ALERT_SEVERITIES, ALERT_RULE_KEYS } = require('../../shared/constants');

// Controlled config schema — every field is a plain positive number, never an arbitrary object.
// Which fields actually apply to a given rule key is enforced in alerts.service (see
// CONFIG_FIELDS_BY_RULE), not here: a single flat schema is simpler than a discriminator for
// three numeric knobs total, and the service layer is what rejects/strips anything not
// applicable to the rule being updated.
const configSchema = new mongoose.Schema(
  {
    graceMinutes: { type: Number },
    staleMinutes: { type: Number },
    pendingMinutes: { type: Number },
  },
  { _id: false }
);

// One document per supported rule key (see ALERT_RULE_KEYS) — manager-configured, persistent.
// Default documents are auto-provisioned (see alerts.service.ensureDefaultRules) so the system
// works out of the box; createdBy/updatedBy are null for that system provisioning, matching the
// "infrastructure, not a manager action" convention already used for seed-created records
// elsewhere (see users.service.createUser).
const alertRuleSchema = new mongoose.Schema(
  {
    key: { type: String, enum: Object.values(ALERT_RULE_KEYS), required: true, unique: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    severity: { type: String, enum: Object.values(ALERT_SEVERITIES), required: true },
    config: { type: configSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AlertRule', alertRuleSchema);
