import { formatSlotTime, toUkDateKey, toUkIsoString } from '../shared/dates.ts';
import type { WorkOrder } from '../db.ts';

export interface Slot {
  workOrderId: string;
  // What we tell the customer. UK local time.
  window: string;
  date: string;
  // The same window as exact instants, UK local with the offset spelled out, so
  // a consumer never has to work out the day from the two strings above.
  startsAt: string;
  endsAt: string;
}

// W-4412 was closed twice as cannot reproduce. It reproduces on any box whose
// clock is not UK time: the window was rendered with the process clock, so a
// UTC server printed it an hour early right through British Summer Time. Dev
// laptops are on UK time, which is why it was always green locally. The date
// was worse, being the UTC date of the stored time rather than the UK date the
// window opens on.
const WINDOW_PADDING_MINUTES = 60;

// The customer is given a window, not a time: the requested time, minus an hour,
// through the requested time plus the job length plus an hour.
export function slotFor(order: WorkOrder): Slot {
  const start = new Date(order.requestedAt);
  const from = new Date(start.getTime() - WINDOW_PADDING_MINUTES * 60_000);
  const to = new Date(
    start.getTime() + (order.durationMinutes + WINDOW_PADDING_MINUTES) * 60_000,
  );

  // A late job opens on one UK day and closes on the next. Say so, rather than
  // printing 02:15 under a date the customer reads as the same evening.
  const crossesMidnight = toUkDateKey(from) !== toUkDateKey(to);
  const closes = crossesMidnight ? ' the next day' : '';

  return {
    workOrderId: order.id,
    window: `${formatSlotTime(from)} to ${formatSlotTime(to)}${closes}`,
    date: toUkDateKey(from),
    startsAt: toUkIsoString(from),
    endsAt: toUkIsoString(to),
  };
}

export function slotsFor(orders: WorkOrder[]): Slot[] {
  return orders.map(slotFor);
}
