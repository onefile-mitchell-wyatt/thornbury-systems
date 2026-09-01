// Consolidated account statement. Trelawney Foods asked for one document per
// quarter instead of reconciling the separate invoice PDFs by hand.
//
// Two things this deliberately does not do:
//
// It does not group by service period. Invoices are issued at the start of the
// quarter *after* the one they cover (INV-9002 is "Q2" but issued 2026-07-01) and
// there is no service period field on Invoice, so the only honest basis is the
// issue date. That is reported on the statement rather than hidden.
//
// It does not parse `issued` into a Date. The stored values are plain YYYY-MM-DD
// strings, which compare correctly as strings. Going via Date would drag in the
// UTC/UK-local problem that dates.ts warns about and put the wrong date on a
// customer facing document.

import { totalFor, outstandingFor, type InvoiceTotal } from './calc.ts';
import { sum, format, type Pence } from '../shared/money.ts';
import type { Customer, Invoice, LineItem } from '../db.ts';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface StatementEntry {
  invoiceId: string;
  issued: string;
  source: Invoice['source'];
  paid: boolean;
  lines: LineItem[];
  totals: InvoiceTotal;
  display: string;
}

export interface StatementPeriod {
  // null means unbounded: the caller asked for the whole account history.
  from: string | null;
  to: string | null;
  basis: 'ISSUE_DATE';
}

export interface Statement {
  customer: Customer;
  period: StatementPeriod;
  invoices: StatementEntry[];
  invoiceCount: number;
  grandTotal: Pence;
  grandTotalDisplay: string;
  // Whole account, not just this period. This is the amount the customer owes us
  // today, which is what they need to see even if some of it predates the period.
  outstanding: Pence;
  outstandingDisplay: string;
  notes: string[];
}

export function isDateKey(value: string): boolean {
  return DATE_KEY.test(value);
}

function inPeriod(issued: string, from?: string, to?: string): boolean {
  if (from && issued < from) return false;
  if (to && issued > to) return false;
  return true;
}

function entryFor(invoice: Invoice): StatementEntry {
  // Spread whatever totalFor returns rather than picking fields out of it, so a
  // VAT breakdown appearing in InvoiceTotal reaches the statement on its own.
  const totals = { ...totalFor(invoice) };
  return {
    invoiceId: invoice.id,
    issued: invoice.issued,
    source: invoice.source,
    paid: invoice.paid,
    lines: invoice.lines,
    totals,
    display: format(totals.total),
  };
}

export function statementFor(
  customer: Customer,
  all: Invoice[],
  from?: string,
  to?: string,
): Statement {
  const entries = all
    .filter((i) => i.customerId === customer.id && inPeriod(i.issued, from, to))
    .sort((a, b) => (a.issued === b.issued ? a.id.localeCompare(b.id) : a.issued < b.issued ? -1 : 1))
    .map(entryFor);

  const grandTotal = sum(entries.map((e) => e.totals.total));
  const outstanding = outstandingFor(customer.id, all);

  const notes = [
    'Invoices are selected by issue date. Invoices are issued after the period they cover.',
    'Outstanding is the balance on the whole account, not only this period.',
  ];

  return {
    customer,
    period: { from: from ?? null, to: to ?? null, basis: 'ISSUE_DATE' },
    invoices: entries,
    invoiceCount: entries.length,
    grandTotal,
    grandTotalDisplay: format(grandTotal),
    outstanding,
    outstandingDisplay: format(outstanding),
    notes,
  };
}
