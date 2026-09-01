import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../src/scheduling/slots.ts';
import { dispatch } from '../src/scheduling/dispatch.ts';
import { toUkDateKey } from '../src/shared/dates.ts';
import { workOrders, type Engineer, type WorkOrder } from '../src/db.ts';

// Fixtures are built here rather than by mutating the shared seed, and every
// assertion is on a UK local value from the shared helpers, never on a Date
// getter. W-4412 shipped twice because a test agreed with the clock of the box
// it ran on.
function order(over: Partial<WorkOrder> & { id: string }): WorkOrder {
  return {
    customerId: 'C-1001',
    address: '14 Ashfield Row, Bristol',
    requires: 'METER',
    requestedAt: '2026-09-02T08:00:00Z',
    durationMinutes: 60,
    status: 'QUEUED',
    ...over,
  };
}

test('a customer is quoted a window around the requested time', () => {
  const found = workOrders.find((w) => w.id === 'W-5001')!;
  const slot = slotFor(found);
  assert.equal(slot.window, '08:00 to 11:00');
  assert.equal(slot.date, '2026-09-02');
});

test('dispatch only plans queued work', () => {
  const { plan } = dispatch(workOrders.map((w) => ({ ...w, status: 'DONE' as const })));
  assert.equal(plan.length, 0);
});

test('dispatch matches the required skill', () => {
  const { plan } = dispatch(workOrders);
  const backflow = plan.find((a) => a.workOrderId === 'W-5003');
  assert.equal(backflow?.engineerId, 'E-02');
});

// JOB B, cause 1. W-5001 and W-5002 are both 14 Ashfield Row on the same
// morning, differing only in case, because the address is typed in by whoever
// takes the call. Exactly one van should go, and the other order must be
// reported rather than silently dropped.
test('one visit per address per day, even when the address is typed differently', () => {
  const { plan, suppressed } = dispatch(workOrders);

  const ashfield = plan.filter(
    (a) => a.workOrderId === 'W-5001' || a.workOrderId === 'W-5002',
  );
  assert.equal(
    ashfield.length,
    1,
    `expected one visit to Mrs Whitcombe's house, got ${ashfield.length}: ${ashfield
      .map((a) => a.workOrderId)
      .join(', ')}`,
  );
  // Earliest requested wins the clash, so the meter job at 08:00 is the one that goes.
  assert.equal(ashfield[0].workOrderId, 'W-5001');

  assert.deepEqual(
    suppressed.find((s) => s.workOrderId === 'W-5002'),
    { workOrderId: 'W-5002', reason: 'DUPLICATE_ADDRESS', clashesWith: 'W-5001' },
  );
});

// JOB B, cause 2, false positive half. Trelawney's out of hours backflow test is
// stored as 23:30Z on 2 September, which is 00:30 on 3 September in UK local
// time: a genuinely different day from W-5003 at 09:00Z. Counting UTC days gave
// both the same key and dropped the night job with no error and no log.
test('an out of hours job that has rolled over into the next UK day is still dispatched', () => {
  assert.equal(toUkDateKey(new Date('2026-09-02T23:30:00Z')), '2026-09-03');
  assert.equal(toUkDateKey(new Date('2026-09-02T09:00:00Z')), '2026-09-02');

  const { plan, suppressed } = dispatch(workOrders);
  assert.ok(
    plan.some((a) => a.workOrderId === 'W-5006'),
    'W-5006 is a different UK day from W-5003 and must be dispatched',
  );
  assert.equal(suppressed.some((s) => s.workOrderId === 'W-5006'), false);
});

// JOB B, cause 2, false negative half. Two visits to one house on one UK day,
// the first just after local midnight. Different UTC dates, so counting UTC days
// let the second van through.
test('two visits on one UK day are deduped even when they fall on different UTC days', () => {
  const orders = [
    order({ id: 'W-9001', requestedAt: '2026-09-01T23:30:00Z', requires: 'LEAK', durationMinutes: 30 }),
    order({ id: 'W-9002', requestedAt: '2026-09-02T08:00:00Z' }),
  ];

  assert.notEqual(orders[0].requestedAt.slice(0, 10), orders[1].requestedAt.slice(0, 10));
  assert.equal(
    toUkDateKey(new Date(orders[0].requestedAt)),
    toUkDateKey(new Date(orders[1].requestedAt)),
  );

  const { plan, suppressed } = dispatch(orders);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].workOrderId, 'W-9001');
  assert.deepEqual(suppressed, [
    { workOrderId: 'W-9002', reason: 'DUPLICATE_ADDRESS', clashesWith: 'W-9001' },
  ]);
});

// JOB B, cause 4. The office takes calls all day. A leak reported at lunchtime
// must not get its own van when the morning run already sent one to that house.
// The trailing full stop is deliberate: it is the other way an operator's typing
// used to defeat the check.
test('a house the morning run already covered does not get a second van', () => {
  const orders = [
    order({ id: 'W-9101', status: 'DISPATCHED', engineerId: 'E-01' }),
    order({
      id: 'W-9102',
      address: '14 ashfield row, bristol.',
      requires: 'LEAK',
      requestedAt: '2026-09-02T14:00:00Z',
    }),
  ];

  const { plan, suppressed } = dispatch(orders);
  assert.equal(plan.length, 0);
  assert.deepEqual(suppressed, [
    { workOrderId: 'W-9102', reason: 'DUPLICATE_ADDRESS', clashesWith: 'W-9101' },
  ]);
});

// JOB B, cause 3. Skilled is not the same as free.
test('two overlapping jobs at different houses go to different engineers', () => {
  const orders = [
    order({ id: 'W-9201', address: '2 Bell Lane, Thornbury', requires: 'LEAK', requestedAt: '2026-09-02T08:00:00Z' }),
    order({ id: 'W-9202', address: 'Gloucester Road, Thornbury', requires: 'LEAK', requestedAt: '2026-09-02T08:30:00Z' }),
  ];

  const { plan, suppressed } = dispatch(orders);
  assert.equal(plan.length, 2);
  assert.notEqual(
    plan[0].engineerId,
    plan[1].engineerId,
    `${plan[0].engineerId} cannot be at two houses at once`,
  );
  assert.equal(suppressed.length, 0);
});

test('an overlapping job with only one skilled engineer is reported, not double booked', () => {
  const solo: Engineer[] = [{ id: 'E-99', name: 'Only Engineer', skills: ['LEAK'] }];
  const orders = [
    order({ id: 'W-9201', address: '2 Bell Lane, Thornbury', requires: 'LEAK', requestedAt: '2026-09-02T08:00:00Z' }),
    order({ id: 'W-9202', address: 'Gloucester Road, Thornbury', requires: 'LEAK', requestedAt: '2026-09-02T08:30:00Z' }),
  ];

  const { plan, suppressed } = dispatch(orders, solo);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].workOrderId, 'W-9201');
  assert.deepEqual(suppressed, [
    { workOrderId: 'W-9202', reason: 'NO_ENGINEER_AVAILABLE', detail: 'LEAK' },
  ]);
});

test('an order nobody is qualified for is reported rather than vanishing', () => {
  const { plan, suppressed } = dispatch([order({ id: 'W-9301', requires: 'HYDRANT' })]);
  assert.equal(plan.length, 0);
  assert.deepEqual(suppressed, [
    { workOrderId: 'W-9301', reason: 'NO_SKILLED_ENGINEER', detail: 'HYDRANT' },
  ]);
});
