// Date helpers shared by billing and scheduling.
//
// Everything the customer sees is UK local time. Everything we store is UTC.
// The two are not the same thing for half the year and this file is where that
// keeps going wrong.

export const BANK_HOLIDAYS_2026 = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04',
  '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
];

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

// The customer sees UK local time, always. getHours()/getMinutes() read the
// PROCESS timezone, so this rendered UTC on the build box and any non-UK server
// (an hour out in BST, a whole day out at a day boundary) while looking fine on a
// UK dev machine. Format Europe/London explicitly so the output no longer depends
// on where the code runs.
const LONDON_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});

// What the customer is told their appointment time is. UK local, HH:MM.
export function formatSlotTime(d: Date): string {
  // en-GB renders midnight as '00:00'; guard the rare '24:00' just in case.
  return LONDON_TIME.format(d).replace(/^24:/, '00:');
}

// The customer-facing calendar date for an instant, in UK local time. YYYY-MM-DD.
// Uses the Europe/London day, not the UTC day (toDateKey / toISOString), so an
// out-of-hours slot stored just before midnight UTC shows the correct local day.
const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatSlotDate(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return LONDON_DATE.format(d);
}

export function sameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}
