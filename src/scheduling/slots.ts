import {
  formatShortDay,
  formatSlotTime,
  toDateKey,
  toUkIsoString,
} from '../shared/dates.ts';
import type { WorkOrder } from '../db.ts';

export interface Slot {
  workOrderId: string;
  // What we tell the customer. UK local time.
  window: string;
  // The UK calendar date of the appointment itself.
  date: string;
  // The same window as exact instants, UK local with the offset spelled out, so
  // a consumer never has to work the day out from the two strings above.
  startsAt: string;
  endsAt: string;
}

// W-4412 was closed twice as cannot reproduce and JOB D is the same defect
// reported a third time. It reproduces on demand. The confirmation was built
// from two clocks and neither was the UK one we promise. The window came from
// getHours(), which reads whatever box the process is on, so a UTC server
// printed it an hour early right through British Summer Time. The date was the
// UTC date of the stored time, so a job at 23:30Z on a summer evening was dated
// the day before its own appointment. Both only bite between 23:00Z and midnight
// in BST, which is why every report came in the summer and none of them
// reproduced on a UK laptop in winter.
const WINDOW_PADDING_MINUTES = 60;

// The customer is given a window, not a time: the requested time, minus an hour,
// through the requested time plus the job length plus an hour.
export function slotFor(order: WorkOrder): Slot {
  const start = new Date(order.requestedAt);
  const from = new Date(start.getTime() - WINDOW_PADDING_MINUTES * 60_000);
  const to = new Date(
    start.getTime() + (order.durationMinutes + WINDOW_PADDING_MINUTES) * 60_000,
  );

  // A late job opens on one UK day and closes on the next. Say which end is
  // which, rather than printing two bare times under a single date.
  const crossesMidnight = toDateKey(from) !== toDateKey(to);
  const window = crossesMidnight
    ? `${formatSlotTime(from)} (${formatShortDay(from)}) to ${formatSlotTime(to)} (${formatShortDay(to)})`
    : `${formatSlotTime(from)} to ${formatSlotTime(to)}`;

  return {
    workOrderId: order.id,
    window,
    date: toDateKey(start),
    startsAt: toUkIsoString(from),
    endsAt: toUkIsoString(to),
  };
}

export function slotsFor(orders: WorkOrder[]): Slot[] {
  return orders.map(slotFor);
}
