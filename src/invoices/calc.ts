import { sum, type Pence } from '../shared/money.ts';
import type { Customer, Invoice, LineItem } from '../db.ts';
import {
  bandsFor,
  rateForLine,
  vatAppliesTo,
  type RateRelevantCustomer,
  type RatedAmount,
  type VatBand,
} from './vat.ts';

export interface InvoiceTotal {
  // VAT-exclusive total of every line, plus any legacy surcharge.
  net: Pence;
  // One entry per VAT rate on this invoice, highest rate first. Empty when the
  // invoice pre-dates VAT_CHARGING_START_DATE: no rate was determined for it,
  // and claiming a 0% band would assert something we never decided.
  bands: VatBand[];
  // Sum of bands[].vat.
  vat: Pence;
  // net + vat. What the customer owes.
  gross: Pence;
  // Alias of gross. The web front end is not in this repository and reads this
  // name, so it stays: an un-updated caller should read the right number rather
  // than undefined. New code should use gross.
  total: Pence;
}

export function lineTotal(line: LineItem): Pence {
  return line.quantity * line.unitPence;
}

// Paper invoices carried a printing and postage charge that the web product
// never had. Kept so historic invoices still reconcile.
function legacySurcharge(invoice: Invoice): Pence {
  if (invoice.source === 'LEGACY_PAPER') {
    return 150;
  }
  return 0;
}

export function totalFor(invoice: Invoice, customer: RateRelevantCustomer): InvoiceTotal {
  // There is no tsconfig in this repository and --experimental-strip-types
  // erases annotations without checking them, so a stale one-argument call site
  // arrives here as undefined at runtime. Fail loudly rather than quietly
  // zero-rating an invoice that should carry VAT.
  if (typeof customer !== 'object' || customer === null) {
    throw new TypeError(`totalFor(${invoice.id}) needs the customer as its second argument`);
  }

  const rated: RatedAmount[] = invoice.lines.map((line) => ({
    net: lineTotal(line),
    rate: rateForLine(line, customer).rate,
  }));

  // The printing and postage charge is not work the customer asked us to do
  // (contrast HMRC VWASS5600) but an incidental cost of billing them for their
  // water, so it is ancillary to the supply and takes the same rate.
  //
  // It goes into 'rated' rather than being added to 'net' afterwards, otherwise
  // the bands stop reconciling to the net and the 150p is invisible to anything
  // that sums them. In practice this never carries VAT: every LEGACY_PAPER
  // invoice pre-dates 2019 and returns below before any band is built.
  const surcharge = legacySurcharge(invoice);
  if (surcharge > 0) {
    rated.push({ net: surcharge, rate: rateForLine({ kind: 'SUPPLY' }, customer).rate });
  }

  const net = sum(rated.map((r) => r.net));

  if (!vatAppliesTo(invoice)) {
    // Issued before we started charging VAT. Leave it exactly as it went out.
    return { net, bands: [], vat: 0, gross: net, total: net };
  }

  const bands = bandsFor(rated);
  const vat = sum(bands.map((b) => b.vat));
  return { net, bands, vat, gross: net + vat, total: net + vat };
}

// Takes the Customer rather than an id: the VAT rate depends on the customer,
// and the only caller has already resolved them. Passing the object also means
// every invoice in the loop is priced against the same customer by construction.
export function outstandingFor(customer: Customer, all: Invoice[]): Pence {
  // Without this guard, passing the old customerId string returns 0 rather than
  // failing -- 'C-1001'.id is undefined, nothing matches the filter, and sum([])
  // is 0. Nothing typechecks this repository, so the guard is the only thing
  // standing between a stale call site and a balance that is silently always
  // zero.
  if (typeof customer !== 'object' || customer === null) {
    throw new TypeError('outstandingFor now takes a Customer, not a customer id');
  }
  return sum(
    all.filter((i) => i.customerId === customer.id && !i.paid).map((i) => totalFor(i, customer).gross),
  );
}
