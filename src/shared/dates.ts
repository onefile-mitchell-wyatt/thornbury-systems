// Date helpers shared by billing and scheduling.
//
// Everything the customer sees is UK local time. Everything we store is UTC.
// The two are not the same thing for half the year and this file is where that
// keeps going wrong.
//
// Anything customer facing goes through the Europe/London formatters below.
// getHours() reads the clock of whatever box the process is on and toISOString()
// reads UTC. Neither of those is the clock we promised the customer, so neither
// can be used for something we show someone or for counting days.

export const UK_TIME_ZONE = 'Europe/London';

// Intl needs full ICU to know about Europe/London. A small-icu build resolves
// every zone to UTC without complaining, which is precisely the fault this file
// exists to fix, so fail at startup rather than quietly re-creating it.
if (
  new Intl.DateTimeFormat('en-GB', { timeZone: UK_TIME_ZONE })
    .resolvedOptions().timeZone !== UK_TIME_ZONE
) {
  throw new Error(`This Node build cannot resolve ${UK_TIME_ZONE}. Full ICU is required.`);
}

export const BANK_HOLIDAYS_2026 = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04',
  '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
];

const UK_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

const UK_SHORT_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TIME_ZONE,
  day: 'numeric',
  month: 'short',
});

function ukParts(d: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const { type, value } of UK_PARTS.formatToParts(d)) {
    parts[type] = value;
  }
  return parts;
}

// Intl spells the offset 'GMT+01:00' through summer. Current ICU says
// 'GMT+00:00' in winter, but older builds emit a bare 'GMT', so the empty case
// is real and has to be handled rather than assumed away.
function offsetOf(timeZoneName: string): string {
  const offset = timeZoneName.replace('GMT', '');
  return offset === '' ? '+00:00' : offset;
}

// A date key back to an instant we can do weekday arithmetic on, anchored at
// midday so no offset can push it onto a neighbouring day.
function middayUtc(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}

// The UK calendar date. Not the UTC date: late on an evening between March and
// October those are two different days, which is what we kept telling customers.
export function toDateKey(d: Date): string {
  const p = ukParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isWorkingDay(d: Date): boolean {
  const key = toDateKey(d);
  const day = middayUtc(key).getUTCDay();
  if (day === 0 || day === 6) return false;
  return !BANK_HOLIDAYS_2026.includes(key);
}

// Steps UK calendar days, not the process clock's days. The result is anchored
// at midday UTC rather than carrying the time of day of `from`: this answers
// 'which day', and a time of day on that answer would only be a time in some
// timezone nobody chose.
export function addWorkingDays(from: Date, n: number): Date {
  let cursor = middayUtc(toDateKey(from));
  let left = n;
  while (left > 0) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60_000);
    if (isWorkingDay(cursor)) left--;
  }
  return cursor;
}

// What the customer is told their appointment time is.
export function formatSlotTime(d: Date): string {
  const p = ukParts(d);
  return `${p.hour}:${p.minute}`;
}

// Day and month as the customer reads it, for labelling the two ends of a window
// that runs over midnight.
export function formatShortDay(d: Date): string {
  return UK_SHORT_DAY.format(d);
}

// The same instant with the UK offset spelled out, for consumers that need the
// day and not just the time.
export function toUkIsoString(d: Date): string {
  const p = ukParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offsetOf(p.timeZoneName)}`;
}

// Same UK day. The dispatcher's one-visit-per-address-per-day check runs on this,
// so it counts UK days: a 23:30 job on a summer evening and a 09:00 job the next
// morning are the same day to a customer, not two.
export function sameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}
