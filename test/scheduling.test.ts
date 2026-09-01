import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotFor } from '../src/scheduling/slots.ts';
import { dispatch } from '../src/scheduling/dispatch.ts';
import { workOrders } from '../src/db.ts';

// The customer is always shown UK local time. W-5001 is stored 08:00Z; in BST
// that is 09:00 local, and the padded window (07:00Z..10:00Z) is 08:00..11:00
// local. These are the Europe/London values and they hold on EVERY machine now
// that the slot no longer renders in the process timezone. Before the fix this
// assertion only passed because the build box happened to run UK time; on a UTC
// server (where the customer confirmations are generated) the same code rendered
// the window an hour early. This is the true expectation, not a loosened one.
test('a customer is quoted a window around the requested time, in UK local time', () => {
  const order = workOrders.find((w) => w.id === 'W-5001')!;
  const slot = slotFor(order);
  assert.equal(slot.window, '08:00 to 11:00');
  assert.equal(slot.date, '2026-09-02');
});

// JOB D / W-4412: the ghost "wrong day" ticket. W-5006 (Trelawney's out-of-hours
// backflow test) is stored 23:30Z on 2026-09-02. In BST that is 00:30 the NEXT
// morning, so the customer's local date is 2026-09-03. The old code derived the
// date from the UTC day (requestedAt.slice(0, 10)) and printed 2026-09-02 -- a
// whole day early -- on every machine, which is the wrong date the customer was
// confirmed. It never failed in winter (GMT == UTC) or on a UK dev box, which is
// why it was closed twice as "cannot reproduce".
test('an out-of-hours slot near midnight UTC shows the correct UK local day', () => {
  const order = workOrders.find((w) => w.id === 'W-5006')!;
  const slot = slotFor(order);
  assert.equal(slot.date, '2026-09-03');
  assert.equal(slot.window, '23:30 to 02:15');
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
