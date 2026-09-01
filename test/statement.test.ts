import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statementFor, UnknownCustomerError } from '../src/invoices/statement.ts';
import { customers, invoices } from '../src/db.ts';

test('statement carries the customer details', () => {
  const s = statementFor('C-1002', customers, invoices);
  assert.equal(s.customer.id, 'C-1002');
  assert.equal(s.customer.name, 'Trelawney Foods Ltd');
  assert.equal(s.customer.accountType, 'COMMERCIAL');
});

test('statement lists only that customer\'s invoices', () => {
  const s = statementFor('C-1002', customers, invoices);
  assert.deepEqual(
    s.invoices.map((i) => i.id),
    ['INV-9002'],
  );
  assert.ok(s.invoices.every((i) => i.total > 0));
});

test('statement invoice line carries id, issued date, total in pence and paid flag', () => {
  const s = statementFor('C-1002', customers, invoices);
  const line = s.invoices.find((i) => i.id === 'INV-9002')!;
  // 1120*195 + 9600 + 2*8500 = 218400 + 9600 + 17000 = 245000
  assert.deepEqual(line, {
    id: 'INV-9002',
    issued: '2026-07-01',
    total: 245000,
    paid: false,
  });
});

test('outstanding is the sum of unpaid invoice totals, in pence', () => {
  const s = statementFor('C-1002', customers, invoices);
  assert.equal(s.outstanding, 245000);
});

test('a fully paid customer has a zero outstanding balance', () => {
  const s = statementFor('C-1001', customers, invoices);
  assert.deepEqual(s.invoices.map((i) => i.id), ['INV-9001']);
  assert.equal(s.outstanding, 0);
});

test('unknown customer throws UnknownCustomerError', () => {
  assert.throws(() => statementFor('C-9999', customers, invoices), UnknownCustomerError);
});
