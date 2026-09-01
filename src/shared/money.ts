// Money is held in pence everywhere below the UI. Anything that hands a number
// to a customer goes through format().
//
// Historic note: the desktop product stored pounds as floats and we still get
// the odd 0.1 + 0.2 ticket from the import path. Do not add float arithmetic here.

export type Pence = number;

export function pounds(p: Pence): number {
  return p / 100;
}

export function format(p: Pence): string {
  const negative = p < 0;
  const abs = Math.abs(p);
  const whole = Math.floor(abs / 100);
  const part = abs % 100;
  return `${negative ? '-' : ''}£${whole.toLocaleString('en-GB')}.${String(part).padStart(2, '0')}`;
}

export function sum(items: Pence[]): Pence {
  return items.reduce((a, b) => a + b, 0);
}

// Percentage of a pence amount, rounded half up to the nearest penny.
//
// This is the VAT calculation's rounding primitive: src/invoices/vat.ts calls
// it once per rate band. Do not simplify it to Math.floor -- the HMRC round-down
// concession is only open to traders who do not supply final consumers, and we
// bill households. Half up also matters the day a 5% reduced rate appears; at
// 20% a tie cannot arise, so nothing here would catch the change.
export function percentOf(p: Pence, percent: number): Pence {
  return Math.round((p * percent) / 100);
}
