import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalFor, lineTotal, outstandingFor } from '../src/invoices/calc.ts';
import { invoices, type Invoice } from '../src/db.ts';

test('line totals multiply quantity by unit price', () => {
  assert.equal(lineTotal({ description: 'x', quantity: 41, unitPence: 218, kind: 'SUPPLY' }), 8938);
});

test('invoice totals expose net, vat and total, with total = net + vat', () => {
  for (const invoice of invoices) {
    const { net, vat, total } = totalFor(invoice);
    assert.equal(total, net + vat, `${invoice.id}: total must equal net + vat`);
    assert.ok(vat >= 0, `${invoice.id}: vat must not be negative`);
  }
});

test('VAT applies to SERVICE lines at 20% and to SUPPLY lines at 0% (per line, not whole invoice)', () => {
  // INV-9002: SUPPLY 1120*195=218400 + SUPPLY 1*9600=9600 + SERVICE 2*8500=17000
  //   net = 245000; vat = 20% of the SERVICE net only = 3400; total = 248400
  const invoice = invoices.find((i) => i.id === 'INV-9002')!;
  const result = totalFor(invoice);
  assert.equal(result.net, 245000, 'net');
  assert.equal(result.vat, 3400, 'vat is 20% of SERVICE net only, SUPPLY zero-rated');
  assert.equal(result.total, 248400, 'total = net + vat');
});

test('an all-SUPPLY (zero-rated) invoice carries no VAT', () => {
  // INV-9001: two SUPPLY lines, no SERVICE work -> vat must be 0
  const invoice = invoices.find((i) => i.id === 'INV-9001')!;
  const result = totalFor(invoice);
  assert.equal(result.vat, 0, 'domestic water supply is zero-rated');
  assert.equal(result.total, result.net);
});

test('outstanding balance ignores paid invoices', () => {
  const owed = outstandingFor('C-1001', invoices);
  assert.equal(owed, 0);
});

test('outstanding balance includes VAT', () => {
  // C-1002 has only INV-9002 unpaid -> outstanding must be the VAT-inclusive total.
  const owed = outstandingFor('C-1002', invoices);
  assert.equal(owed, 248400);
});

test('legacy paper invoices carry the postage surcharge', () => {
  const paper: Invoice = {
    id: 'INV-0001',
    customerId: 'C-1001',
    issued: '2018-03-01',
    source: 'LEGACY_PAPER',
    paid: true,
    lines: [{ description: 'Metered supply', quantity: 10, unitPence: 100, kind: 'SUPPLY' }],
  };
  assert.equal(totalFor(paper).total, 1150);
});
