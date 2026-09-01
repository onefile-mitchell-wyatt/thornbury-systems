import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../src/scheduling/slots.ts';
import { dispatch } from '../src/scheduling/dispatch.ts';
import { workOrders, type WorkOrder } from '../src/db.ts';

test('a customer is quoted a window around the requested time', () => {
  const order = workOrders.find((w) => w.id === 'W-5001')!;
  const slot = slotFor(order);
  assert.equal(slot.window, '08:00 to 11:00');
  assert.equal(slot.date, '2026-09-02');
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

// JOB B: two vans, one house. Addresses are typed in by whoever takes the call,
// so the same house comes through spelled differently. W-5001 and W-5002 are both
// for 14 Ashfield Row on the same morning, differing only in case and spacing.
// Exactly one van should go.
test('one visit per address per day, even when the address is typed differently', () => {
  const plan = dispatch(workOrders);
  const atAshfield = plan.filter(
    (a) => a.address.replace(/\s+/g, ' ').trim().toLowerCase() === '14 ashfield row, bristol',
  );
  assert.equal(
    atAshfield.length,
    1,
    `expected one visit to Mrs Whitcombe's house, got ${atAshfield.length}: ${atAshfield
      .map((a) => a.workOrderId)
      .join(', ')}`,
  );
});

// W-4412 and JOB D. These assert UK local values, not whatever the clock on the
// box says, so they hold under any TZ. The old test passed only on a UK clock,
// which is how this shipped twice.

function orderAt(id: string, requestedAt: string, durationMinutes: number): WorkOrder {
  return {
    id,
    customerId: 'C-1002',
    address: 'Unit 6, Severnside Park, Avonmouth',
    requires: 'BACKFLOW',
    requestedAt,
    durationMinutes,
    status: 'QUEUED',
  };
}

test('a summer window is British Summer Time, not UTC', () => {
  const slot = slotFor(workOrders.find((w) => w.id === 'W-5001')!);
  assert.equal(slot.window, '08:00 to 11:00');
  assert.equal(slot.startsAt, '2026-09-02T08:00:00+01:00');
  assert.equal(slot.endsAt, '2026-09-02T11:00:00+01:00');
});

test('a winter window is GMT', () => {
  const slot = slotFor(orderAt('W-WINTER', '2026-01-14T08:00:00Z', 60));
  assert.equal(slot.window, '07:00 to 10:00');
  assert.equal(slot.date, '2026-01-14');
  assert.equal(slot.startsAt, '2026-01-14T07:00:00+00:00');
});

test('W-5006: a late job says it runs past midnight', () => {
  const slot = slotFor(workOrders.find((w) => w.id === 'W-5006')!);
  assert.equal(slot.date, '2026-09-02');
  assert.equal(slot.window, '23:30 to 02:15 the next day');
  assert.equal(slot.startsAt, '2026-09-02T23:30:00+01:00');
  // The engineer arrives 00:30 on the 3rd. That has to be visible somewhere.
  assert.equal(slot.endsAt, '2026-09-03T02:15:00+01:00');
});

test('a window is dated by the UK day it opens, not the UTC day of the stored time', () => {
  // Stored 00:30 on the 15th UTC. In GMT the window opens 23:30 the evening
  // before, so the customer is expecting us on the 14th. The old code read the
  // date straight off the stored string and said the 15th.
  const slot = slotFor(orderAt('W-LATE', '2026-01-15T00:30:00Z', 45));
  assert.equal(slot.date, '2026-01-14');
  assert.equal(slot.window, '23:30 to 02:15 the next day');
  assert.equal(slot.startsAt, '2026-01-14T23:30:00+00:00');
});

test('a window inside one UK day is not marked as crossing midnight', () => {
  const slot = slotFor(orderAt('W-DAYTIME', '2026-09-02T13:00:00Z', 30));
  assert.ok(!slot.window.includes('next day'));
  assert.equal(slot.window, '13:00 to 15:30');
});
