const mongoose = require('mongoose');

const scheduledShiftSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },
    // Set once, at most, when a WorkShift starts and gets matched to this schedule (see
    // scheduledShifts.service.matchWorkShiftToSchedule). Never re-matched or changed after that
    // — the schedule is comparison-only and never modifies or is modified by the actual shift.
    workShift: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkShift', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

scheduledShiftSchema.index({ driver: 1, scheduledStart: 1 });
scheduledShiftSchema.index({ driver: 1, workShift: 1 });

module.exports = mongoose.model('ScheduledShift', scheduledShiftSchema);
