const HttpError = require('../../shared/httpError');
const { isValidTime } = require('../../shared/scheduleResolution');
const { SCHEDULE_EXCEPTION_TYPES } = require('../../shared/constants');

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value) {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime());
}

function validateDefaultShift(req, res, next) {
  const { name, startTime, durationMinutes, activeDays, enabled, effectiveFrom } = req.body;

  if (enabled) {
    if (!isValidTime(startTime)) {
      return next(new HttpError(400, 'startTime debe tener formato HH:mm'));
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return next(new HttpError(400, 'durationMinutes debe ser un número positivo'));
    }
    if (
      !Array.isArray(activeDays) ||
      activeDays.length === 0 ||
      activeDays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
    ) {
      return next(new HttpError(400, 'activeDays debe ser una lista de días ISO (1=lunes .. 7=domingo)'));
    }
    // Required while enabling — the UI always offers "Hoy" or an explicit date, never a blank
    // choice, so an enabled schedule with no effectiveFrom should never reach here in practice.
    if (!isValidDateKey(effectiveFrom)) {
      return next(new HttpError(400, 'effectiveFrom debe tener formato YYYY-MM-DD'));
    }
  } else if (effectiveFrom !== undefined && effectiveFrom !== null && !isValidDateKey(effectiveFrom)) {
    return next(new HttpError(400, 'effectiveFrom debe tener formato YYYY-MM-DD'));
  }
  if (name !== undefined && typeof name !== 'string') {
    return next(new HttpError(400, 'name debe ser texto'));
  }

  next();
}

function validateExceptionTimes(type, startTime, durationMinutes, next) {
  if (!Object.values(SCHEDULE_EXCEPTION_TYPES).includes(type)) {
    next(new HttpError(400, `type debe ser uno de: ${Object.values(SCHEDULE_EXCEPTION_TYPES).join(', ')}`));
    return false;
  }
  if (type === SCHEDULE_EXCEPTION_TYPES.WORK && (startTime !== undefined || durationMinutes !== undefined)) {
    next(new HttpError(400, 'Una excepción WORK usa el horario habitual del chofer — no lleva startTime/durationMinutes propios'));
    return false;
  }
  if (type === SCHEDULE_EXCEPTION_TYPES.REST && (startTime !== undefined || durationMinutes !== undefined)) {
    next(new HttpError(400, 'Una excepción REST no lleva horario'));
    return false;
  }
  if (type === SCHEDULE_EXCEPTION_TYPES.CUSTOM) {
    if (startTime === undefined && durationMinutes === undefined) {
      next(new HttpError(400, 'Una excepción CUSTOM requiere startTime y/o durationMinutes'));
      return false;
    }
    if (startTime !== undefined && !isValidTime(startTime)) {
      next(new HttpError(400, 'startTime debe tener formato HH:mm'));
      return false;
    }
    if (durationMinutes !== undefined && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
      next(new HttpError(400, 'durationMinutes debe ser un número positivo'));
      return false;
    }
  }
  return true;
}

function validateException(req, res, next) {
  const { driver, date, type, startTime, durationMinutes } = req.body;

  if (!driver) {
    return next(new HttpError(400, 'El chofer es requerido'));
  }
  if (!isValidDateKey(date)) {
    return next(new HttpError(400, 'date debe tener formato YYYY-MM-DD (fecha exacta, sin hora)'));
  }
  if (validateExceptionTimes(type, startTime, durationMinutes, next)) next();
}

// Update never changes driver/date (an exception's identity) — only type/startTime/
// durationMinutes/reason — so this only re-checks the type/time coherence, not driver/date.
function validateExceptionUpdate(req, res, next) {
  const { type, startTime, durationMinutes } = req.body;
  if (validateExceptionTimes(type, startTime, durationMinutes, next)) next();
}

module.exports = { validateDefaultShift, validateException, validateExceptionUpdate };
