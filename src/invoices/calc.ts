import { sum, percentOf, type Pence } from '../shared/money.ts';
import type { Invoice, LineItem } from '../db.ts';

export interface InvoiceTotal {
  net: Pence;
  vat: Pence;
  total: Pence;
}

// UK output VAT is charged on what is being sold, per line, not per invoice:
//   SERVICE (engineer work) is standard-rated at 20%.
//   SUPPLY  (metered domestic water) is zero-rated.
// Customer.vatRegistered does NOT change what we charge as output VAT, so it is
// deliberately not consulted here.
const VAT_RATE_BY_KIND: Record<LineItem['kind'], number> = {
  SERVICE: 20,
  SUPPLY: 0,
};

export function lineTotal(line: LineItem): Pence {
  return line.quantity * line.unitPence;
}

function lineVat(line: LineItem): Pence {
  return percentOf(lineTotal(line), VAT_RATE_BY_KIND[line.kind]);
}

// Paper invoices carried a printing and postage charge that the web product
// never had. Kept so historic invoices still reconcile.
function legacySurcharge(invoice: Invoice): Pence {
  if (invoice.source === 'LEGACY_PAPER') {
    return 150;
  }
  return 0;
}

export function totalFor(invoice: Invoice): InvoiceTotal {
  const net = sum(invoice.lines.map(lineTotal)) + legacySurcharge(invoice);
  // VAT is worked out per line by kind so a mixed invoice is only charged on its
  // standard-rated (SERVICE) lines. The legacy paper surcharge is not vatable.
  const vat = sum(invoice.lines.map(lineVat));
  return { net, vat, total: net + vat };
}

export function outstandingFor(customerId: string, all: Invoice[]): Pence {
  return sum(
    all.filter((i) => i.customerId === customerId && !i.paid).map((i) => totalFor(i).total),
  );
}
