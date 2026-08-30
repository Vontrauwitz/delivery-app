const HttpError = require('../../shared/httpError');

// Shallow checks only — the actual per-rule config field validation (which fields are allowed,
// positive-integer bounds) happens in alerts.service.updateRule, which needs the existing rule
// document to fall back to unset fields. This just rejects an obviously malformed body early.
function validateUpdateRuleBody(req, res, next) {
  const { enabled, severity, config } = req.body;

  if (enabled === undefined && severity === undefined && config === undefined) {
    return next(new HttpError(400, 'Debes indicar al menos un campo a actualizar (enabled, severity o config)'));
  }
  if (config !== undefined && (typeof config !== 'object' || config === null || Array.isArray(config))) {
    return next(new HttpError(400, 'config debe ser un objeto'));
  }

  next();
}

module.exports = { validateUpdateRuleBody };
