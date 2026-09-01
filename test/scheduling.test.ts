import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../src/scheduling/slots.ts';
import { dispatch } from '../src/scheduling/dispatch.ts';
import { workOrders } from '../src/db.ts';

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

test('dispatch sends one van per house even when the address is typed differently', () => {
  // W-5001 "14 Ashfield Row, Bristol" and W-5002 "14 ashfield row, bristol" are
  // the same house on the same day, hand-typed with different casing. Only one
  // van should be planned for it.
  const plan = dispatch(workOrders);
  const toWhitcombe = plan.filter(
    (a) => a.workOrderId === 'W-5001' || a.workOrderId === 'W-5002',
  );
  assert.equal(toWhitcombe.length, 1);
});
