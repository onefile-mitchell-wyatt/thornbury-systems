import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VAT_CHARGING_START_DATE,
  bandsFor,
  isRelevantIndustrialActivity,
  rateForLine,
  vatAppliesTo,
} from '../src/invoices/vat.ts';
import type { Customer } from '../src/db.ts';

const SUPPLY = { kind: 'SUPPLY' } as const;
const SERVICE = { kind: 'SERVICE' } as const;

test('water for a household is zero rated', () => {
  assert.equal(rateForLine(SUPPLY, { sicDivision: null }).rate, 0);
});

test('water for a food manufacturer is standard rated', () => {
  // SIC 1980 division 4, other manufacturing, which includes food and drink.
  // A relevant industrial activity, so outside the Group 2 zero rating.
  assert.equal(rateForLine(SUPPLY, { sicDivision: 4 }).rate, 20);
});

test('water for a school is zero rated even though the school is a commercial, VAT registered customer', () => {
  // This is the assertion that pins the whole rule. Division 9 is other
  // services, which is not in divisions 1 to 5, so the zero rating stands.
  // Anything that keys off accountType or vatRegistered fails here.
  assert.equal(rateForLine(SUPPLY, { sicDivision: 9 }).rate, 0);
});

test('services are standard rated whoever the customer is', () => {
  assert.equal(rateForLine(SERVICE, { sicDivision: null }).rate, 20);
  assert.equal(rateForLine(SERVICE, { sicDivision: 4 }).rate, 20);
  assert.equal(rateForLine(SERVICE, { sicDivision: 9 }).rate, 20);
});

test('the customer being registered for VAT does not change the rate', () => {
  const base: Customer = {
    id: 'C-TEST', name: 'Test', address: 'Somewhere',
    accountType: 'COMMERCIAL', vatRegistered: false, sicDivision: 9,
  };
  const registered: Customer = { ...base, vatRegistered: true };
  assert.equal(rateForLine(SUPPLY, base).rate, rateForLine(SUPPLY, registered).rate);
  assert.equal(rateForLine(SERVICE, base).rate, rateForLine(SERVICE, registered).rate);
});

test('every rate decision carries a reason', () => {
  for (const customer of [{ sicDivision: null }, { sicDivision: 4 }] as const) {
    for (const line of [SUPPLY, SERVICE]) {
      assert.ok(rateForLine(line, customer).reason.length > 0);
    }
  }
});

test('relevant industrial activity is divisions 1 to 5 and nothing else', () => {
  // Division 0 is agriculture. It sits outside the range, so a farm keeps its
  // zero rating -- this is why 0 cannot be used as a "no business" sentinel.
  assert.equal(isRelevantIndustrialActivity(0), false);
  assert.equal(isRelevantIndustrialActivity(1), true);
  assert.equal(isRelevantIndustrialActivity(5), true);
  assert.equal(isRelevantIndustrialActivity(6), false);
  assert.equal(isRelevantIndustrialActivity(9), false);
  assert.equal(isRelevantIndustrialActivity(null), false);
});

test('the cutover date is 2026-07-01', () => {
  // Finance owns this value. If you changed it deliberately, re-check the seed
  // expectations in invoices.test.ts, which move with it.
  assert.equal(VAT_CHARGING_START_DATE, '2026-07-01');
});

test('an invoice issued on the cutover date is in scope', () => {
  assert.equal(vatAppliesTo({ id: 'T', issued: '2026-06-30' }), false);
  assert.equal(vatAppliesTo({ id: 'T', issued: VAT_CHARGING_START_DATE }), true);
  assert.equal(vatAppliesTo({ id: 'T', issued: '2026-07-02' }), true);
});

test('the cutover gate rejects a date that is not YYYY-MM-DD', () => {
  // '01/07/2026' would compare as false and silently stop charging VAT.
  assert.throws(() => vatAppliesTo({ id: 'INV-BAD', issued: '01/07/2026' }), /INV-BAD/);
});

test('VAT is rounded once per band, not once per line', () => {
  // Per line this would be Math.round(0.6) twice, which is 2p.
  assert.deepEqual(bandsFor([{ net: 3, rate: 20 }, { net: 3, rate: 20 }]), [
    { rate: 20, net: 6, vat: 1 },
  ]);
});

test('band VAT rounds half up to the penny', () => {
  assert.equal(bandsFor([{ net: 999, rate: 20 }])[0].vat, 200);
  assert.equal(bandsFor([{ net: 997, rate: 20 }])[0].vat, 199);
});

test('bands come back highest rate first', () => {
  const bands = bandsFor([{ net: 100, rate: 0 }, { net: 100, rate: 20 }]);
  assert.deepEqual(bands.map((b) => b.rate), [20, 0]);
});

test('a zero rated band is present, not omitted', () => {
  assert.deepEqual(bandsFor([{ net: 9594, rate: 0 }]), [{ rate: 0, net: 9594, vat: 0 }]);
});
