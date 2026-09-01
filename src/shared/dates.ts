// Date helpers shared by billing and scheduling.
//
// Everything the customer sees is UK local time. Everything we store is UTC.
// The two are not the same thing for half the year and this file is where that
// keeps going wrong.
//
// Anything customer facing goes through the Europe/London helpers at the bottom
// of this file. The Date getters read the clock of whatever box the process is
// on, which is UK time on a laptop and UTC on a server, so they cannot be used
// for anything we show someone.

export const UK_TIME_ZONE = 'Europe/London';

export const BANK_HOLIDAYS_2026 = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04',
  '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
];

// UTC date key. Still what the dispatcher's one-visit-per-address-per-day check
// counts, so that check counts UTC days and not UK days. See JOB B.
export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !BANK_HOLIDAYS_2026.includes(toDateKey(d));
}

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isWorkingDay(d)) left--;
  }
  return d;
}

export function sameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

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

function ukParts(d: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const { type, value } of UK_PARTS.formatToParts(d)) {
    parts[type] = value;
  }
  return parts;
}

// Intl spells the offset 'GMT+01:00' through summer and a bare 'GMT' in winter.
function offsetOf(timeZoneName: string): string {
  const offset = timeZoneName.replace('GMT', '');
  return offset === '' ? '+00:00' : offset;
}

// The calendar date in UK local time. Not the same as toDateKey for anything
// late in the evening between March and October.
export function toUkDateKey(d: Date): string {
  const p = ukParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

// What the customer is told their appointment time is.
export function formatSlotTime(d: Date): string {
  const p = ukParts(d);
  return `${p.hour}:${p.minute}`;
}

// The same instant with the UK offset spelled out, for consumers that need the
// day and not just the time.
export function toUkIsoString(d: Date): string {
  const p = ukParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offsetOf(p.timeZoneName)}`;
}
