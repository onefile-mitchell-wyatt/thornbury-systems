import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalFor, lineTotal, outstandingFor } from '../src/invoices/calc.ts';
import { VAT_CHARGING_START_DATE } from '../src/invoices/vat.ts';
import { customers, invoices, type Customer, type Invoice } from '../src/db.ts';

const customerFor = (invoice: Invoice): Customer =>
  customers.find((c) => c.id === invoice.customerId)!;
const invoiceById = (id: string): Invoice => invoices.find((i) => i.id === id)!;
const customerById = (id: string): Customer => customers.find((c) => c.id === id)!;

test('line totals multiply quantity by unit price', () => {
  assert.equal(lineTotal({ description: 'x', quantity: 41, unitPence: 218, kind: 'SUPPLY' }), 8938);
});

test('invoice totals are calculated for every invoice', () => {
  for (const invoice of invoices) {
    totalFor(invoice, customerFor(invoice));
  }
});

test('every invoice total is internally consistent', () => {
  for (const invoice of invoices) {
    const t = totalFor(invoice, customerFor(invoice));
    assert.equal(t.gross, t.net + t.vat, `${invoice.id} gross`);
    assert.equal(t.total, t.gross, `${invoice.id} total is an alias of gross`);
    assert.equal(t.vat, t.bands.reduce((a, b) => a + b.vat, 0), `${invoice.id} vat`);
    if (t.bands.length > 0) {
      assert.equal(t.net, t.bands.reduce((a, b) => a + b.net, 0), `${invoice.id} bands reconcile to net`);
    }
    for (const value of [t.net, t.vat, t.gross]) {
      // format() has no integer guard and renders a fraction as garbage rather
      // than throwing, so every figure reaching it must be whole pence.
      assert.ok(Number.isInteger(value), `${invoice.id} ${value} is whole pence`);
    }
  }
});

test('domestic water and the standing charge that goes with it are zero rated', () => {
  const t = totalFor(invoiceById('INV-9001'), customerById('C-1001'));
  assert.equal(t.net, 11338);
  assert.equal(t.vat, 0);
  assert.equal(t.gross, 11338);
  assert.deepEqual(t.bands, [{ rate: 0, net: 11338, vat: 0 }]);
});

test('commercial invoice totals', () => {
  // Trelawney Foods are SIC 1980 division 4, so their water, their standing
  // charge and the backflow test all sit at 20% and collapse into ONE band.
  const t = totalFor(invoiceById('INV-9002'), customerById('C-1002'));
  assert.equal(t.net, 245000);
  assert.equal(t.vat, 49000);
  assert.equal(t.gross, 294000);
  assert.deepEqual(t.bands, [{ rate: 20, net: 245000, vat: 49000 }]);
});

test('one invoice can carry both rates', () => {
  // Zero rated water plus a standard rated emergency call out.
  const t = totalFor(invoiceById('INV-9003'), customerById('C-1003'));
  assert.equal(t.net, 23594);
  assert.equal(t.vat, 2800);
  assert.equal(t.gross, 26394);
  assert.deepEqual(t.bands, [
    { rate: 20, net: 14000, vat: 2800 },
    { rate: 0, net: 9594, vat: 0 },
  ]);
});

test('an invoice issued before the cutover is left exactly as it was sent', () => {
  // INV-9004 was issued 2026-04-01. No VAT, and no bands: we never made a rate
  // determination for it, so claiming a 0% band would assert something untrue.
  const t = totalFor(invoiceById('INV-9004'), customerById('C-1004'));
  assert.equal(t.net, 563400);
  assert.equal(t.vat, 0);
  assert.equal(t.gross, 563400);
  assert.deepEqual(t.bands, []);
});

test('a commercial, VAT registered customer still gets zero rated water', () => {
  // Severn Vale Academy is a school, division 9, so not a relevant industrial
  // activity. Their only seeded invoice pre-dates the cutover, so this fixture
  // is what actually exercises the rule for them.
  const invoice: Invoice = {
    ...invoiceById('INV-9004'),
    id: 'INV-9004-POSTCUTOVER',
    issued: VAT_CHARGING_START_DATE,
  };
  const t = totalFor(invoice, customerById('C-1004'));
  assert.equal(t.vat, 0);
  assert.deepEqual(t.bands, [{ rate: 0, net: 563400, vat: 0 }]);
});

test('outstanding balance ignores paid invoices', () => {
  const owed = outstandingFor(customerById('C-1001'), invoices);
  assert.equal(owed, 0);
});

test('outstanding balance is VAT inclusive', () => {
  assert.equal(outstandingFor(customerById('C-1002'), invoices), 294000);
  assert.equal(outstandingFor(customerById('C-1003'), invoices), 26394);
  assert.equal(outstandingFor(customerById('C-1004'), invoices), 0);
});

test('outstanding balance refuses a customer id', () => {
  // Passing the old string silently returned 0 rather than failing, and nothing
  // typechecks this repository, so the guard is the only thing catching it.
  assert.throws(() => outstandingFor('C-1002' as unknown as Customer, invoices), TypeError);
});

test('invoice totals refuse a missing customer', () => {
  assert.throws(() => totalFor(invoiceById('INV-9002'), undefined as unknown as Customer), TypeError);
});

test('legacy paper invoices carry the postage surcharge', () => {
  // Issued 2018, so before the cutover: no VAT, and the total is unchanged from
  // what went out on paper. This is the test that proves "going forward only".
  const paper: Invoice = {
    id: 'INV-0001',
    customerId: 'C-1001',
    issued: '2018-03-01',
    source: 'LEGACY_PAPER',
    paid: true,
    lines: [{ description: 'Metered supply', quantity: 10, unitPence: 100, kind: 'SUPPLY' }],
  };
  assert.equal(totalFor(paper, customerById('C-1001')).total, 1150);
});

test('the postage surcharge is banded with the water it was printed for', () => {
  // Defensive only: the paper importer was switched off in 2019, so no real
  // LEGACY_PAPER invoice can reach the cutover. It matters because the
  // surcharge must stay inside the bands or they stop reconciling to net.
  const paper: Invoice = {
    id: 'INV-0002',
    customerId: 'C-1001',
    issued: VAT_CHARGING_START_DATE,
    source: 'LEGACY_PAPER',
    paid: true,
    lines: [{ description: 'Metered supply', quantity: 10, unitPence: 100, kind: 'SUPPLY' }],
  };
  const domestic = totalFor(paper, customerById('C-1001'));
  assert.equal(domestic.net, 1150);
  assert.deepEqual(domestic.bands, [{ rate: 0, net: 1150, vat: 0 }]);

  const industrial = totalFor({ ...paper, customerId: 'C-1002' }, customerById('C-1002'));
  assert.equal(industrial.net, 1150);
  assert.equal(industrial.gross, 1380);
  assert.deepEqual(industrial.bands, [{ rate: 20, net: 1150, vat: 230 }]);
});
