// Driver schedule expectations regression suite: default schedule CRUD (manager-only, audited),
// date-specific exceptions CRUD (manager-only, audited, one per driver per date), the resolution
// priority chain (ScheduledShift > exception > default > rest day), and one live-status smoke
// test proving GET /driver-schedule/status really composes resolution + the actual WorkShift
// correctly end-to-end over real HTTP.
//
// The exhaustive status-transition matrix (every one of the 9 statuses, overnight/24h shifts,
// exact tolerance boundaries) is covered deterministically with synthetic Date objects in
// test/unit-schedule-resolution.js — this suite deliberately does not re-derive that here with
// real wall-clock timing, which would be slower and flakier for no extra coverage.
//
// Usage: node test/e2e-driver-schedule.js (or: npm run test:e2e:driver-schedule)

const { assert, req, assertServerReachable, resetAndSeed, finish } = require('./helpers');

// Next real calendar date (at least minDaysOut away) matching the given ISO weekday
// (1=Monday..7=Sunday) — deterministic regardless of which day the suite actually runs on.
function nextDateWithWeekday(isoWeekday, minDaysOut = 3) {
  const d = new Date();
  d.setDate(d.getDate() + minDaysOut);
  for (;;) {
    const js = d.getDay();
    const iso = js === 0 ? 7 : js;
    if (iso === isoWeekday) return d;
    d.setDate(d.getDate() + 1);
  }
}

function dateKey(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function main() {
  await assertServerReachable();
  await resetAndSeed();

  const managerLogin = await req('/auth/login', { method: 'POST', body: { email: 'manager@delivery.test', password: '123456' } });
  const managerToken = managerLogin.data.token;
  const driverLogin = await req('/auth/login', { method: 'POST', body: { email: 'driver@delivery.test', password: '123456' } });
  const driverToken = driverLogin.data.token;
  const driverId = driverLogin.data.user.id;

  // --- Default schedule: manager-only, audited ---

  await req(`/driver-schedule/drivers/${driverId}/default-shift`, {
    method: 'PUT',
    token: driverToken,
    body: { startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5], enabled: true },
    expectStatus: 403,
  });

  const todayKeyForDefault = dateKey(new Date());
  const setDefault = await req(`/driver-schedule/drivers/${driverId}/default-shift`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Turno base', startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5], effectiveFrom: todayKeyForDefault, enabled: true },
    expectStatus: 200,
  });
  assert(setDefault.data.enabled === true, 'manager can enable the driver default schedule');
  assert(setDefault.data.startTime === '06:00' && setDefault.data.durationMinutes === 720, 'default schedule stores startTime/durationMinutes, not start/end');
  assert(JSON.stringify(setDefault.data.activeDays) === JSON.stringify([1, 2, 3, 4, 5]), 'activeDays stored as given (ISO weekdays)');
  assert(!!setDefault.data.effectiveFrom, 'effectiveFrom is stored');

  const meAsDriver = await req('/users/me', { token: driverToken, expectStatus: 200 });
  assert(meAsDriver.data.defaultShift?.enabled === true, 'driver can view (but did not set) their own default schedule via GET /users/me');

  const auditDefault = await req(`/audit?entity=User&entityId=${driverId}`, { token: managerToken, expectStatus: 200 });
  const defaultAuditEntry = auditDefault.data.find((a) => a.action === 'UPDATE_DEFAULT_SHIFT');
  assert(!!defaultAuditEntry, 'UPDATE_DEFAULT_SHIFT audit entry recorded');
  assert(defaultAuditEntry.changes[0].newValue.enabled === true, 'audit entry newValue reflects the change');
  assert(!defaultAuditEntry.changes[0].oldValue.enabled, 'audit entry oldValue reflects the prior (disabled) state');
  assert(defaultAuditEntry.performedBy?._id === managerLogin.data.user.id || defaultAuditEntry.performedBy === managerLogin.data.user.id, 'audit entry records who performed the change');

  // --- Resolution priority: default schedule vs rest day ---

  const workingWed = nextDateWithWeekday(3); // Mon-Fri active -> Wednesday works
  const restSunday = nextDateWithWeekday(7); // Sunday not in activeDays -> rest

  const resolvedWorkingWed = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(workingWed)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedWorkingWed.data.source === 'DEFAULT', `a Wed within Mon-Fri activeDays resolves to source DEFAULT (got ${resolvedWorkingWed.data.source})`);
  assert(resolvedWorkingWed.data.isWorkingDay === true, 'that Wednesday is a working day');

  const resolvedRestSunday = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(restSunday)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedRestSunday.data.source === 'NONE', `a Sunday outside activeDays resolves to source NONE (got ${resolvedRestSunday.data.source})`);
  assert(resolvedRestSunday.data.isWorkingDay === false, 'that Sunday is a rest day by default');

  // --- Exceptions: manager-only, audited, WORK/REST override ---

  await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: driverToken,
    body: { driver: driverId, date: dateKey(restSunday), type: 'WORK' },
    expectStatus: 403,
  });

  const workException = await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, date: dateKey(restSunday), type: 'WORK', reason: 'cobertura especial' },
    expectStatus: 201,
  });

  const duplicateException = await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, date: dateKey(restSunday), type: 'REST' },
    expectStatus: 409,
  });
  assert(/ya existe/i.test(duplicateException.data.error), 'a second exception for the same driver+date is rejected (409), not silently overwritten');

  const resolvedAfterWork = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(restSunday)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedAfterWork.data.source === 'EXCEPTION', 'WORK exception on the rest Sunday resolves to source EXCEPTION');
  assert(resolvedAfterWork.data.isWorkingDay === true, 'WORK exception turns that Sunday into a working day');
  assert(new Date(resolvedAfterWork.data.expectedStart).getHours() === 6, 'WORK exception uses the driver default template hours (06:00)');

  const restException = await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, date: dateKey(workingWed), type: 'REST', reason: 'día libre' },
    expectStatus: 201,
  });
  const resolvedAfterRest = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(workingWed)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedAfterRest.data.isWorkingDay === false, 'REST exception overrides the normally-working Wednesday');

  // --- CUSTOM exception hours ---

  const customDate = nextDateWithWeekday(3, 14); // a different Wednesday
  const customException = await req('/driver-schedule/exceptions', {
    method: 'POST',
    token: managerToken,
    body: { driver: driverId, date: dateKey(customDate), type: 'CUSTOM', startTime: '08:00' },
    expectStatus: 201,
  });
  const resolvedCustom = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(customDate)}`, { token: managerToken, expectStatus: 200 });
  assert(new Date(resolvedCustom.data.expectedStart).getHours() === 8, 'CUSTOM exception applies the overridden start (08:00)');
  assert(new Date(resolvedCustom.data.expectedEnd).getHours() === 20, 'CUSTOM exception falls back to the default duration (720min) for the end (20:00)');

  const updateCustom = await req(`/driver-schedule/exceptions/${customException.data._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { type: 'CUSTOM', startTime: '08:00', durationMinutes: 480 },
    expectStatus: 200,
  });
  assert(updateCustom.data.durationMinutes === 480, 'manager can update an existing exception');
  const resolvedCustomUpdated = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(customDate)}`, { token: managerToken, expectStatus: 200 });
  assert(new Date(resolvedCustomUpdated.data.expectedEnd).getHours() === 16, 'updated CUSTOM duration is reflected in resolution (08:00+8h=16:00)');

  const auditException = await req(`/audit?entity=DriverScheduleException&entityId=${customException.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(auditException.data.some((a) => a.action === 'CREATE_SCHEDULE_EXCEPTION'), 'CREATE_SCHEDULE_EXCEPTION audit entry recorded');
  assert(auditException.data.some((a) => a.action === 'UPDATE_SCHEDULE_EXCEPTION'), 'UPDATE_SCHEDULE_EXCEPTION audit entry recorded');

  // --- ScheduledShift takes priority over an exception ---

  const explicitSchedule = await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      scheduledStart: new Date(restSunday.getFullYear(), restSunday.getMonth(), restSunday.getDate(), 9, 0).toISOString(),
      scheduledEnd: new Date(restSunday.getFullYear(), restSunday.getMonth(), restSunday.getDate(), 17, 0).toISOString(),
    },
    expectStatus: 201,
  });
  const resolvedWithSchedule = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(restSunday)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedWithSchedule.data.source === 'SCHEDULED_SHIFT', 'an explicit ScheduledShift outranks the WORK exception for the same date');
  assert(new Date(resolvedWithSchedule.data.expectedStart).getHours() === 9, 'ScheduledShift times (09:00) are used, not the exception/default times (06:00)');

  // --- Delete exception, driver blocked, audit recorded ---

  await req(`/driver-schedule/exceptions/${workException.data._id}`, { method: 'DELETE', token: driverToken, expectStatus: 403 });
  await req(`/driver-schedule/exceptions/${customException.data._id}`, { method: 'DELETE', token: managerToken, expectStatus: 204 });

  const resolvedAfterDelete = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(customDate)}`, { token: managerToken, expectStatus: 200 });
  assert(resolvedAfterDelete.data.source === 'DEFAULT', 'deleting the CUSTOM exception reverts that date back to the default schedule');

  const auditDeleted = await req(`/audit?entity=DriverScheduleException&entityId=${customException.data._id}`, { token: managerToken, expectStatus: 200 });
  assert(auditDeleted.data.some((a) => a.action === 'DELETE_SCHEDULE_EXCEPTION'), 'DELETE_SCHEDULE_EXCEPTION audit entry recorded — the exception is gone but its history is not');

  // --- defaultShift.effectiveFrom: gates only the DEFAULT branch, on real HTTP ---
  // Push effectiveFrom out to a future date and confirm a nearer working-weekday date stops
  // resolving via DEFAULT, while the effectiveFrom date itself (and beyond) still does.

  const futureEffectiveFrom = nextDateWithWeekday(3, 21); // a Wednesday well after customDate

  const effFromUpdate = await req(`/driver-schedule/drivers/${driverId}/default-shift`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Turno base', startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5], effectiveFrom: dateKey(futureEffectiveFrom), enabled: true },
    expectStatus: 200,
  });
  assert(!!effFromUpdate.data.effectiveFrom, 'effectiveFrom updated to the new future date');

  // customDate (its CUSTOM exception was already deleted above, confirmed reverted to DEFAULT)
  // is a plain Wednesday with nothing else attached — exactly what's needed to isolate the
  // effectiveFrom gate on the DEFAULT branch itself, and it's safely before futureEffectiveFrom.
  const beforeEffectiveFrom = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(customDate)}`, { token: managerToken, expectStatus: 200 });
  assert(
    beforeEffectiveFrom.data.source === 'NONE' && beforeEffectiveFrom.data.isWorkingDay === false,
    `a working weekday before defaultShift.effectiveFrom no longer resolves via DEFAULT (got source=${beforeEffectiveFrom.data.source})`
  );

  const onEffectiveFrom = await req(`/driver-schedule/resolved?driver=${driverId}&date=${dateKey(futureEffectiveFrom)}`, { token: managerToken, expectStatus: 200 });
  assert(onEffectiveFrom.data.source === 'DEFAULT', 'the effectiveFrom date itself resolves via DEFAULT (on/after, not strictly after)');

  const auditEffFrom = await req(`/audit?entity=User&entityId=${driverId}`, { token: managerToken, expectStatus: 200 });
  const effFromEntries = auditEffFrom.data.filter((a) => a.action === 'UPDATE_DEFAULT_SHIFT');
  assert(
    effFromEntries.some((a) => new Date(a.changes[0].newValue.effectiveFrom).getTime() === new Date(effFromUpdate.data.effectiveFrom).getTime()),
    'the effectiveFrom change itself is captured in the UPDATE_DEFAULT_SHIFT audit trail (it is just a field on the audited defaultShift object)'
  );

  // Restore effectiveFrom to today so it doesn't interfere with anything relying on the default
  // schedule being active for "today" (the live-status smoke test below uses an explicit
  // ScheduledShift instead, which outranks defaultShift entirely — but keep state clean anyway).
  await req(`/driver-schedule/drivers/${driverId}/default-shift`, {
    method: 'PUT',
    token: managerToken,
    body: { name: 'Turno base', startTime: '06:00', durationMinutes: 720, activeDays: [1, 2, 3, 4, 5], effectiveFrom: dateKey(new Date()), enabled: true },
    expectStatus: 200,
  });

  // --- Live status smoke test (real HTTP, real WorkShift, real "now") ---
  // Exact-minute-equality assertions are avoided below (allowing a small window) since real
  // wall-clock time elapses between requests while this suite runs.

  const now = new Date();

  // db:reset (run by resetAndSeed above) already seeds a demo ScheduledShift for today
  // (09:00-17:00 local) as baseline data — remove it first so it can't win the "earliest
  // scheduledStart wins" tie-break over the one this test is about to create for today.
  const existingForDriver = await req(`/scheduled-shifts?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  const todayKey = dateKey(now);
  for (const existing of existingForDriver.data) {
    if (dateKey(new Date(existing.scheduledStart)) === todayKey) {
      await req(`/scheduled-shifts/${existing._id}`, { method: 'DELETE', token: managerToken, expectStatus: 204 });
    }
  }

  // `now - 2h`, clamped to never go earlier than local midnight today. A plain `now - 2h` (as
  // used previously) crosses into YESTERDAY's local calendar day whenever the suite happens to
  // run within ~2h of local midnight, which makes findForDriverAndDate's day-scoped query miss
  // this ScheduledShift entirely (a real flake this test hit — not a scheduleResolution bug, the
  // day-boundary math there is correct; the bug was this anchor being tied to real-clock
  // jitter). Only scheduledStart's calendar day matters for that query, so clamping only it is
  // sufficient — scheduledEnd is free to be any later instant (see the SHOULD_HAVE_ENDED update
  // below, which is itself clamped against this same anchor for the same reason).
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const scheduledStartAnchor = twoHoursAgo.getTime() > localMidnight.getTime() ? twoHoursAgo : new Date(localMidnight.getTime() + 60000);

  const todaySchedule = await req('/scheduled-shifts', {
    method: 'POST',
    token: managerToken,
    body: {
      driver: driverId,
      scheduledStart: scheduledStartAnchor.toISOString(),
      scheduledEnd: new Date(scheduledStartAnchor.getTime() + 8 * 60 * 60 * 1000).toISOString(),
    },
    expectStatus: 201,
  });

  const startedShift = await req('/work-shifts/start', { method: 'POST', token: driverToken, expectStatus: 201 });
  const lateStart = new Date(scheduledStartAnchor.getTime() + 40 * 60 * 1000); // anchor + 40min, deterministic regardless of real "now"
  await req(`/work-shifts/${startedShift.data._id}/admin-edit`, {
    method: 'PATCH',
    token: managerToken,
    body: { startedAt: lateStart.toISOString(), reason: 'prueba: inicio tardío' },
    expectStatus: 200,
  });

  const statusLate = await req(`/driver-schedule/status?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  assert(
    statusLate.data.status === 'WORKING',
    `driver 40min late with the shift still well before expected end is currently WORKING, not a start-punctuality value (got ${statusLate.data.status})`
  );
  assert(statusLate.data.startStatus === 'LATE_START', `startStatus separately reports LATE_START (got ${statusLate.data.startStatus})`);
  assert(statusLate.data.startDiffMinutes === 40, `startDiffMinutes is exactly 40 — deterministic now that it's anchor-relative, not real-clock-relative (got ${statusLate.data.startDiffMinutes})`);

  const statusMine = await req('/driver-schedule/status/me', { token: driverToken, expectStatus: 200 });
  assert(statusMine.data.status === 'WORKING' && statusMine.data.startStatus === 'LATE_START', "the driver's own status/me view agrees with the manager's view");
  await req('/driver-schedule/status/me', { token: managerToken, expectStatus: 403 });

  // Push the expected end into the past while the shift is still open -> SHOULD_HAVE_ENDED.
  // Clamped to never go earlier than scheduledStartAnchor + 1min, for the same reason
  // scheduledStartAnchor itself is clamped above: `now - 10min` could otherwise land before
  // scheduledStart whenever the suite runs within ~10min of local midnight (the update would
  // then fail scheduledShifts' own "end must be after start" validation instead of testing
  // anything). This still correctly tests SHOULD_HAVE_ENDED in the overwhelming majority of real
  // run times, which is the same wall-clock tradeoff already accepted elsewhere in this section.
  const pushedEnd = new Date(Math.max(now.getTime() - 10 * 60 * 1000, scheduledStartAnchor.getTime() + 60000));
  await req(`/scheduled-shifts/${todaySchedule.data._id}`, {
    method: 'PUT',
    token: managerToken,
    body: { scheduledEnd: pushedEnd.toISOString() },
    expectStatus: 200,
  });

  const statusOverdue = await req(`/driver-schedule/status?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  assert(
    statusOverdue.data.status === 'SHOULD_HAVE_ENDED',
    `an open shift past its (just-updated) expected end reports SHOULD_HAVE_ENDED, not the retrospective EXTENDED (got ${statusOverdue.data.status})`
  );

  const statusAll = await req('/driver-schedule/status', { token: managerToken, expectStatus: 200 });
  assert(
    statusAll.data.some((s) => String(s.driver._id) === String(driverId) && s.status === 'SHOULD_HAVE_ENDED'),
    'the all-drivers status list (no driver param) includes this driver with the same live status'
  );

  const alerts = await req(`/driver-schedule/alerts?driver=${driverId}`, { token: managerToken, expectStatus: 200 });
  assert(
    alerts.data.conditions.some((c) => c.code === 'ACTIVE_SHIFT_PAST_EXPECTED_END'),
    'the alert-condition layer surfaces ACTIVE_SHIFT_PAST_EXPECTED_END for an overdue open shift'
  );

  finish();
}

main().catch((err) => {
  console.error('Fatal error running e2e-driver-schedule:', err);
  process.exitCode = 1;
});
