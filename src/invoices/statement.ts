import type { Customer, Invoice } from '../db.ts';
import type { Pence } from '../shared/money.ts';
import { totalFor, outstandingFor } from './calc.ts';

// A statement gathers every invoice for one customer into a single document,
// so finance teams stop reconciling separate invoice PDFs by hand.
// Money stays in pence here; the front end formats for display.

export interface StatementLine {
  id: string;
  issued: string;
  total: Pence;
  paid: boolean;
}

export interface Statement {
  customer: Customer;
  invoices: StatementLine[];
  outstanding: Pence;
}

// Raised when the requested customer does not exist. The route handler maps
// this to a 404 so the not-found case lives in one place.
export class UnknownCustomerError extends Error {
  readonly customerId: string;
  constructor(customerId: string) {
    super(`no such customer: ${customerId}`);
    this.name = 'UnknownCustomerError';
    this.customerId = customerId;
  }
}

export function statementFor(
  customerId: string,
  customers: Customer[],
  invoices: Invoice[],
): Statement {
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) throw new UnknownCustomerError(customerId);

  const lines: StatementLine[] = invoices
    .filter((i) => i.customerId === customerId)
    .map((i) => ({
      id: i.id,
      issued: i.issued,
      total: totalFor(i).total,
      paid: i.paid,
    }));

  return {
    customer,
    invoices: lines,
    outstanding: outstandingFor(customerId, invoices),
  };
}
