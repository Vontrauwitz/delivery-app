const HttpError = require('../../shared/httpError');
const auditService = require('./audit.service');

async function list(req, res, next) {
  try {
    const { entity, entityId } = req.query;
    if (!entity || !entityId) {
      return next(new HttpError(400, 'entity y entityId son requeridos'));
    }
    const history = await auditService.getHistory(entity, entityId);
    res.json(history);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
