const mongoose = require('mongoose');
const { SCHEDULE_EXCEPTION_TYPES } = require('../../shared/constants');

// One-off override of a driver's recurring default schedule for a single exact calendar date.
// Never mutates the recurring pattern — see shared/scheduleResolution.js for how this sits in
// the priority chain (below an explicit ScheduledShift, above the default schedule). The next
// day automatically falls back to the recurring pattern; nothing here is "recurring" itself.
const driverScheduleExceptionSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // "YYYY-MM-DD", local calendar date — the canonical identity for uniqueness (a Date object
    // alone is precision-fragile for equality; this is the same reasoning as businessDate
    // elsewhere in the app, made explicit here since exceptions are looked up by exact date).
    dateKey: { type: String, required: true },
    date: { type: Date, required: true }, // midnight of dateKey, for range queries/sorting
    type: { type: String, enum: Object.values(SCHEDULE_EXCEPTION_TYPES), required: true },
    // Only meaningful for type CUSTOM — see driverSchedule.validation.js for the enforcement
    // that WORK never carries these and CUSTOM requires at least one.
    startTime: { type: String, default: null },
    durationMinutes: { type: Number, default: null },
    reason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// One exception per driver per date — a second edit updates the existing one rather than
// stacking ambiguous duplicates.
driverScheduleExceptionSchema.index({ driver: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('DriverScheduleException', driverScheduleExceptionSchema);
