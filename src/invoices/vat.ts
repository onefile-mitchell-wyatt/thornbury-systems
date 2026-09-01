// UK VAT liability for water and for the work we do on it.
//
// Read this file before changing any of it. Every rule here comes from statute
// or from published HMRC guidance, and the citation sits on the rule.
//
// The short version:
//   - Water we supply is zero-rated, UNLESS the customer is an industrial
//     business, in which case it is standard-rated.
//   - Work we carry out at the customer's request is standard-rated, whoever
//     they are.
//   - Whether the customer is registered for VAT makes no difference to either.

import { percentOf, type Pence } from '../shared/money.ts';
import type { Customer, Invoice, LineItem, SicDivision } from '../db.ts';

// VATA 1994 s.2(1).
export const STANDARD_RATE_PERCENT = 20;
// VATA 1994 s.30 and Sch 8.
export const ZERO_RATE_PERCENT = 0;

export type VatRatePercent = typeof STANDARD_RATE_PERCENT | typeof ZERO_RATE_PERCENT;

// The date Thornbury started putting VAT on the invoice itself. Anything issued
// before this is reproduced exactly as it was sent: no VAT, no bands, the same
// total to the penny.
//
// FINANCE OWNS THIS VALUE. Do not move it to make a test pass. Moving it
// re-prices every invoice issued on or after the new date, and 'total' is what
// the web front end shows the customer.
//
// Format is YYYY-MM-DD and it is compared as a string. See vatAppliesTo.
export const VAT_CHARGING_START_DATE = '2026-07-01';

// The note to VATA 1994 Sch 8 Group 2 defines 'relevant industrial activity' as
// any activity in Divisions 1 to 5 of the 1980 Standard Industrial
// Classification.
//
// Deliberately a range and not 'division <= 5': Division 0 is agriculture,
// which sits outside it, so a farm's water stays zero-rated.
export function isRelevantIndustrialActivity(division: SicDivision | null): boolean {
  if (division === null) return false;
  return division >= 1 && division <= 5;
}

// The rate does not depend on the customer's VAT registration, their account
// type or their address, so the rate calculation is never handed them. That is
// the point of this type: it makes the usual mistake impossible to write.
export type RateRelevantCustomer = Pick<Customer, 'sicDivision'>;

export interface RateDecision {
  rate: VatRatePercent;
  // Why the line got the rate it got, in words a support agent can repeat to a
  // customer who rings up asking.
  reason: string;
}

export function rateForLine(
  line: Pick<LineItem, 'kind'>,
  customer: RateRelevantCustomer,
): RateDecision {
  if (line.kind === 'SERVICE') {
    // Work carried out at the customer's request: testing private pipe work,
    // reconnections, stopcock work, emergency call outs. Standard-rated for
    // everybody, domestic customers included (HMRC VWASS5600).
    return {
      rate: STANDARD_RATE_PERCENT,
      reason: "Work carried out at the customer's request: standard-rated (HMRC VWASS5600)",
    };
  }

  // 'SUPPLY' is the water itself and anything that follows it. Standing charges
  // and other availability charges take the liability of the supply they relate
  // to (HMRC VWASS2500), so they need no separate case.
  if (isRelevantIndustrialActivity(customer.sicDivision)) {
    // The Group 2 zero rating does not reach water used in connection with a
    // relevant industrial activity, so the standard rate applies.
    return {
      rate: STANDARD_RATE_PERCENT,
      reason: `Water supplied to an industrial business (SIC 1980 division ${customer.sicDivision}): outside the Group 2 zero rating`,
    };
  }

  return {
    rate: ZERO_RATE_PERCENT,
    reason: 'Water supplied other than for a relevant industrial activity: zero-rated (VATA 1994 Sch 8 Group 2 Item 2)',
  };
}

// An amount that has had a rate attached but has not yet been banded.
export interface RatedAmount {
  net: Pence;
  rate: VatRatePercent;
}

// One rate band on an invoice: everything charged at a single rate.
export interface VatBand {
  rate: VatRatePercent;
  net: Pence;
  vat: Pence;
}

// Group rated amounts into one band per rate and work out the VAT.
//
// Rounding happens here and nowhere else: once per band, on the band's net,
// half up to the penny via percentOf. Rounding per line would leave the band's
// VAT disagreeing with its own net when a customer checks it on a calculator,
// and rounding once per invoice cannot work at all when an invoice carries more
// than one rate.
//
// Bands come back highest rate first, always. Once the front end iterates them
// that order is a contract, so do not let it fall back to Map insertion order,
// which varies with the order of the lines.
export function bandsFor(items: RatedAmount[]): VatBand[] {
  const netByRate = new Map<VatRatePercent, Pence>();
  for (const item of items) {
    netByRate.set(item.rate, (netByRate.get(item.rate) ?? 0) + item.net);
  }
  return [...netByRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, net]) => ({ rate, net, vat: percentOf(net, rate) }));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Does this invoice carry VAT at all?
//
// Compared as a string on purpose. YYYY-MM-DD is fixed width, zero padded and
// big endian, so byte order is date order: no timezone, no DST, no parsing and
// no Date allocated anywhere in the VAT path. Do not 'improve' this into
// new Date(...) -- src/shared/dates.ts already mixes UTC and local in the same
// file and that is an open ticket (JOB D).
//
// '>=' means an invoice issued ON the cutover date is in scope.
export function vatAppliesTo(invoice: Pick<Invoice, 'id' | 'issued'>): boolean {
  if (!ISO_DATE.test(invoice.issued)) {
    // A string compare against something like '01/07/2026' returns false and we
    // would quietly stop charging VAT. Silent under-declaration is the failure
    // that goes unnoticed for a year, so refuse to guess.
    throw new Error(
      `Invoice ${invoice.id} has issued date ${JSON.stringify(invoice.issued)}, ` +
        'which is not YYYY-MM-DD. Refusing to guess whether VAT applies.',
    );
  }
  return invoice.issued >= VAT_CHARGING_START_DATE;
}
