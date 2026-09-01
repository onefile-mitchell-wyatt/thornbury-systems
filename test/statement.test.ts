import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementFor, isDateKey } from '../src/invoices/statement.ts';
import { totalFor, outstandingFor } from '../src/invoices/calc.ts';
import { customers, invoices } from '../src/db.ts';
import { format, sum } from '../src/shared/money.ts';

const trelawney = customers.find((c) => c.id === 'C-1002')!;
const academy = customers.find((c) => c.id === 'C-1004')!;

const Q2 = { from: '2026-07-01', to: '2026-09-30' };

test('Trelawney get one statement covering all four of their quarter invoices', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  assert.equal(statement.invoiceCount, 4);
  assert.deepEqual(
    statement.invoices.map((e) => e.invoiceId),
    ['INV-9002', 'INV-9005', 'INV-9006', 'INV-9007'],
  );
});

test('grand total is the sum of the invoice totals', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  // Deliberately derived from totalFor rather than hardcoded, so this still holds
  // once VAT is added to the invoice totals.
  const expected = sum(
    invoices
      .filter((i) => i.customerId === 'C-1002' && i.issued >= Q2.from && i.issued <= Q2.to)
      .map((i) => totalFor(i).total),
  );
  assert.equal(statement.grandTotal, expected);
  assert.equal(statement.grandTotalDisplay, format(expected));
});

test('every money value on the statement goes through format', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  assert.equal(statement.outstandingDisplay, format(statement.outstanding));
  for (const entry of statement.invoices) {
    assert.equal(entry.display, format(entry.totals.total));
  }
  assert.match(statement.grandTotalDisplay, /^\u00A3[\d,]+\.\d{2}$/);
});

test('outstanding is the whole account balance, not just the period', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  assert.equal(statement.outstanding, outstandingFor('C-1002', invoices));
});

test('the period filter excludes invoices issued outside the range', () => {
  // The Academy's only invoice is issued 2026-04-01, so a Q2 statement is empty.
  const statement = statementFor(academy, invoices, Q2.from, Q2.to);
  assert.equal(statement.invoiceCount, 0);
  assert.deepEqual(statement.invoices, []);
  assert.equal(statement.grandTotal, 0);
  assert.equal(statement.grandTotalDisplay, format(0));
});

test('boundary dates are inclusive at both ends', () => {
  const onlyFirst = statementFor(academy, invoices, '2026-04-01', '2026-04-01');
  assert.equal(onlyFirst.invoiceCount, 1);
  assert.equal(onlyFirst.invoices[0].invoiceId, 'INV-9004');
});

test('no range means the whole account history', () => {
  const statement = statementFor(trelawney, invoices);
  assert.equal(statement.invoiceCount, invoices.filter((i) => i.customerId === 'C-1002').length);
  assert.equal(statement.period.from, null);
  assert.equal(statement.period.to, null);
});

test('the statement says it selects on issue date', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  assert.equal(statement.period.basis, 'ISSUE_DATE');
  assert.ok(statement.notes.some((n) => n.includes('issue date')));
});

test('issued dates are passed through untouched', () => {
  // Guards JOB D: if anyone reformats these via Date the stored value shifts by an
  // hour in summer and the customer gets the wrong day on their statement.
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  for (const entry of statement.invoices) {
    const stored = invoices.find((i) => i.id === entry.invoiceId)!;
    assert.equal(entry.issued, stored.issued);
  }
});

test('invoice totals carry through whatever calc returns', () => {
  const statement = statementFor(trelawney, invoices, Q2.from, Q2.to);
  for (const entry of statement.invoices) {
    const stored = invoices.find((i) => i.id === entry.invoiceId)!;
    assert.deepEqual(entry.totals, { ...totalFor(stored) });
  }
});

test('isDateKey accepts YYYY-MM-DD and nothing else', () => {
  assert.ok(isDateKey('2026-07-01'));
  assert.ok(!isDateKey('last-april'));
  assert.ok(!isDateKey('2026-7-1'));
  assert.ok(!isDateKey(''));
});
