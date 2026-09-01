import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay,
  addWorkingDays,
  toDateKey,
  formatSlotTime,
  formatSlotDate,
} from '../src/shared/dates.ts';

test('weekends are not working days', () => {
  assert.equal(isWorkingDay(new Date('2026-09-05T12:00:00Z')), false);
  assert.equal(isWorkingDay(new Date('2026-09-06T12:00:00Z')), false);
});

test('bank holidays are not working days', () => {
  assert.equal(isWorkingDay(new Date('2026-12-25T12:00:00Z')), false);
});

test('adding working days skips the weekend', () => {
  const friday = new Date('2026-09-04T12:00:00Z');
  assert.equal(toDateKey(addWorkingDays(friday, 1)), '2026-09-07');
});

// Customer-facing time is UK local, not the process timezone. In summer (BST)
// UTC and UK local are an hour apart, so 08:00Z is shown as 09:00.
test('formatSlotTime renders UK local time, not UTC', () => {
  assert.equal(formatSlotTime(new Date('2026-09-02T08:00:00Z')), '09:00');
  // Winter (GMT == UTC): no shift.
  assert.equal(formatSlotTime(new Date('2026-01-15T08:00:00Z')), '08:00');
});

// The day-boundary case behind W-4412: 23:30Z in summer is 00:30 the NEXT day.
test('formatSlotDate uses the UK local day across the midnight boundary', () => {
  const nearMidnight = new Date('2026-09-02T23:30:00Z');
  assert.equal(formatSlotTime(nearMidnight), '00:30');
  assert.equal(formatSlotDate(nearMidnight), '2026-09-03');
});
