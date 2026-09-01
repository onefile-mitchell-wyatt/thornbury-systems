import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../src/scheduling/slots.ts';
import { dispatch } from '../src/scheduling/dispatch.ts';
import { workOrders, type WorkOrder } from '../src/db.ts';

// Every assertion below is a UK local value, so it holds whatever clock the box
// is on. See timezone-matrix.test.ts, which proves that rather than assuming it.

function orderAt(
  id: string,
  requestedAt: string,
  durationMinutes: number,
  address = 'Unit 6, Severnside Park, Avonmouth',
): WorkOrder {
  return {
    id,
    customerId: 'C-1002',
    address,
    requires: 'METER',
    requestedAt,
    durationMinutes,
    status: 'QUEUED',
  };
}

test('a customer is quoted a window around the requested time', () => {
  const order = workOrders.find((w) => w.id === 'W-5001')!;
  const slot = slotFor(order);
  assert.equal(slot.window, '08:00 to 11:00');
  assert.equal(slot.date, '2026-09-02');
  assert.equal(slot.startsAt, '2026-09-02T08:00:00+01:00');
  assert.equal(slot.endsAt, '2026-09-02T11:00:00+01:00');
});

test('dispatch only plans queued work', () => {
  const plan = dispatch(workOrders.map((w) => ({ ...w, status: 'DONE' as const })));
  assert.equal(plan.length, 0);
});

test('dispatch matches the required skill', () => {
  const plan = dispatch(workOrders);
  const backflow = plan.find((a) => a.workOrderId === 'W-5003');
  assert.equal(backflow?.engineerId, 'E-02');
});

// JOB D. Trelawney's night shift booked a backflow test for 23:30Z on 2 September,
// which is 00:30 on the 3rd in British Summer Time. We confirmed it for the 2nd.
test('W-5006: a late summer job is dated by the UK day it actually falls on', () => {
  const slot = slotFor(workOrders.find((w) => w.id === 'W-5006')!);
  assert.equal(slot.date, '2026-09-03');
  assert.equal(slot.window, '23:30 (2 Sept) to 02:15 (3 Sept)');
  assert.equal(slot.startsAt, '2026-09-02T23:30:00+01:00');
  assert.equal(slot.endsAt, '2026-09-03T02:15:00+01:00');
});

test('an ordinary daytime window is not tagged as crossing midnight', () => {
  const slot = slotFor(workOrders.find((w) => w.id === 'W-5004')!);
  assert.equal(slot.window, '13:00 to 16:00');
  assert.ok(!slot.window.includes('('), 'daytime windows should carry no day tags');
});

// W-4412: the window was rendered with the process clock, so it printed an hour
// early on a UTC server all through the summer and correctly in winter. The
// offset has to be derived from the instant, never assumed.
test('a winter window is GMT, not a summer offset applied year round', () => {
  const slot = slotFor(orderAt('W-WINTER-DAY', '2026-01-14T08:00:00Z', 60));
  assert.equal(slot.window, '07:00 to 10:00');
  assert.equal(slot.date, '2026-01-14');
  assert.equal(slot.startsAt, '2026-01-14T07:00:00+00:00');
});

test('a late winter job crosses midnight without a summer offset', () => {
  const slot = slotFor(orderAt('W-WINTER-LATE', '2026-01-15T00:30:00Z', 45));
  assert.equal(slot.date, '2026-01-15');
  assert.equal(slot.window, '23:30 (14 Jan) to 02:15 (15 Jan)');
  assert.equal(slot.startsAt, '2026-01-14T23:30:00+00:00');
  assert.equal(slot.endsAt, '2026-01-15T02:15:00+00:00');
});

// The clocks move inside these two windows, so the offset differs between the
// start and the end of a single slot. An hour of wall clock disappears in March
// and repeats in October; both windows are 2h45m of real time.
test('a window spanning the spring forward keeps both offsets straight', () => {
  const slot = slotFor(orderAt('W-DST-SPRING', '2026-03-29T00:30:00Z', 45));
  assert.equal(slot.date, '2026-03-29');
  assert.equal(slot.window, '23:30 (28 Mar) to 03:15 (29 Mar)');
  assert.equal(slot.startsAt, '2026-03-28T23:30:00+00:00');
  assert.equal(slot.endsAt, '2026-03-29T03:15:00+01:00');
});

test('a window spanning the autumn fall back keeps both offsets straight', () => {
  const slot = slotFor(orderAt('W-DST-AUTUMN', '2026-10-25T00:30:00Z', 45));
  assert.equal(slot.date, '2026-10-25');
  assert.equal(slot.window, '00:30 to 02:15');
  assert.equal(slot.startsAt, '2026-10-25T00:30:00+01:00');
  assert.equal(slot.endsAt, '2026-10-25T02:15:00+00:00');
});

// The dispatcher's one-visit-per-address-per-day check runs on sameDay, which now
// counts UK days. These two jobs are on different UTC dates but the same UK date,
// so before this they were treated as two days and two vans went out.
test('one visit per address per UK day, not per UTC day', () => {
  const plan = dispatch([
    orderAt('W-NIGHT', '2026-09-02T23:30:00Z', 45, '1 Test Road, Thornbury'),
    orderAt('W-MORNING', '2026-09-03T08:00:00Z', 60, '1 Test Road, Thornbury'),
  ]);
  assert.equal(plan.length, 1, 'both jobs fall on 3 September in UK local time');
  assert.equal(plan[0].workOrderId, 'W-NIGHT');
});

test('genuinely different UK days still get their own visit', () => {
  const plan = dispatch([
    orderAt('W-DAY-ONE', '2026-09-02T09:00:00Z', 45, '1 Test Road, Thornbury'),
    orderAt('W-DAY-TWO', '2026-09-03T09:00:00Z', 60, '1 Test Road, Thornbury'),
  ]);
  assert.equal(plan.length, 2);
});
