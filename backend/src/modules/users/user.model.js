const mongoose = require('mongoose');
const { ROLES } = require('../../shared/constants');

// Recurring expected schedule, manager-edited, driver-view-only. Deliberately NOT a real
// WorkShift and never used to auto-open/close one — see shared/scheduleResolution.js for how
// this feeds into "what should today look like". activeDays uses ISO 8601 weekday numbers
// (1=Monday..7=Sunday), documented there too.
const defaultShiftSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    startTime: { type: String }, // "HH:mm", validated in driverSchedule.validation.js
    durationMinutes: { type: Number },
    activeDays: { type: [Number], default: [] },
    enabled: { type: Boolean, default: false },
    // Local midnight of the first calendar date this recurring pattern is allowed to resolve
    // for — see shared/scheduleResolution.js's resolveExpectedShift. null/unset means "always
    // effective" (the pre-existing behavior, kept for schedules configured before this field
    // existed). Only gates the DEFAULT branch of the priority chain — an explicit ScheduledShift
    // or DriverScheduleException for a date before effectiveFrom still resolves normally.
    effectiveFrom: { type: Date, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    active: { type: Boolean, default: true },
    defaultShift: { type: defaultShiftSchema, default: () => ({}) },
    // Last authenticated request, updated opportunistically by the auth middleware — the
    // minimal "recent app contact" signal for the alert-condition layer (see
    // driverSchedule.service.checkAlertConditions). Deliberately separate from LocationPing:
    // a driver can have the app open and be actively using it with location permission denied,
    // and vice versa — conflating the two would hide real signal either way.
    //
    // IMPORTANT LIMITATION: this is opportunistic only — it advances whenever any authenticated
    // request happens to fire (a screen load, a pull-to-refresh), not on a fixed interval. It is
    // NOT proof of connectivity while the app is idle/backgrounded during an active shift: a
    // driver can go quiet for the entire duration of a shift with no request ever firing, and
    // lastSeenAt will just sit stale without that meaning anything actionable on its own. Treat
    // NO_RECENT_APP_CONTACT as a weak signal, not a reliable "driver is unreachable" alarm. A
    // future Alerts phase is expected to add a lightweight, fixed-interval active-shift heartbeat
    // that actually proves liveness — this field is not that, and should not be treated as if it
    // already were.
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
