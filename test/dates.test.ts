import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay,
  addWorkingDays,
  toDateKey,
  sameDay,
  toUkIsoString,
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

// Everything above uses midday, which is the one part of the day where the UTC
// date and the UK date always agree. That is why the suite was blind to JOB D
// for two years. Everything below is late enough in the evening to tell them
// apart.

test('the date key is the UK day, not the UTC day', () => {
  // 23:30Z on a summer evening is already half past midnight in London.
  assert.equal(toDateKey(new Date('2026-09-02T23:30:00Z')), '2026-09-03');
  // The same clock time in winter is still the same day, which is why nobody
  // ever managed to reproduce this outside British Summer Time.
  assert.equal(toDateKey(new Date('2026-12-02T23:30:00Z')), '2026-12-02');
});

test('a late Friday evening in summer is already the weekend', () => {
  // UTC still calls this Friday. London calls it Saturday the 5th.
  assert.equal(isWorkingDay(new Date('2026-09-04T23:30:00Z')), false);
});

test('a late evening rolls into the following bank holiday', () => {
  // London says 31 August, which is in BANK_HOLIDAYS_2026. UTC says the 30th.
  assert.equal(isWorkingDay(new Date('2026-08-30T23:30:00Z')), false);
});

test('two instants either side of UTC midnight can be the same UK day', () => {
  const night = new Date('2026-09-02T23:30:00Z');
  const morning = new Date('2026-09-03T08:00:00Z');
  assert.equal(sameDay(night, morning), true);
});

test('the UK ISO string spells out the offset for the season', () => {
  assert.equal(toUkIsoString(new Date('2026-09-02T23:30:00Z')), '2026-09-03T00:30:00+01:00');
  assert.equal(toUkIsoString(new Date('2026-12-02T23:30:00Z')), '2026-12-02T23:30:00+00:00');
});

test('working day arithmetic steps UK days from a late evening start', () => {
  // Starts at 00:30 on Saturday 5 September in London. The next working day is
  // Monday the 7th. Reading the UTC date would start it on Friday and answer
  // with the Friday instead.
  const lateFridayNight = new Date('2026-09-04T23:30:00Z');
  assert.equal(toDateKey(addWorkingDays(lateFridayNight, 1)), '2026-09-07');
});
