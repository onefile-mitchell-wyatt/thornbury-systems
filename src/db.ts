// In-memory store. The real product is on SQL Server; this is the slice the web
// front end was built against while the migration stalled.

export type CustomerId = string;

// Division of the 1980 Standard Industrial Classification. The 1980 revision
// specifically, not SIC 2007: VATA 1994 Sch 8 Group 2 pins the test to the 1980
// classification, so a code from any other revision must be mapped before it is
// stored here.
//
//   0 Agriculture, forestry and fishing    5 Construction
//   1 Energy and water supply              6 Distribution, hotels and catering
//   2 Minerals, metals and chemicals       7 Transport and communication
//   3 Metal goods, engineering, vehicles   8 Banking, finance, business services
//   4 Other manufacturing (incl. food)     9 Other services
//
// Divisions 1 to 5 are a 'relevant industrial activity' for VAT. Note that 0 is
// outside that range, so a farm still gets zero-rated water.
export type SicDivision = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Customer {
  id: CustomerId;
  name: string;
  address: string;
  accountType: 'DOMESTIC' | 'COMMERCIAL';
  // Whether the customer is registered for VAT themselves. This governs what
  // they can reclaim, not what we charge them, and must not be read by the rate
  // calculation. See src/invoices/vat.ts.
  vatRegistered: boolean;
  // The customer's predominant business activity across all of their sites, not
  // the activity at this address and not what the water is actually used for
  // (HMRC VWASS2200, VWASS2600). null means no business activity.
  //
  // Required rather than optional on purpose: this field decides a tax rate, so
  // 'this is a household' and 'nobody has filled this in' must not look alike.
  sicDivision: SicDivision | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPence: number;
  // 'SUPPLY' is metered water. 'SERVICE' is engineer work and is charged differently.
  kind: 'SUPPLY' | 'SERVICE';
}

export interface Invoice {
  id: string;
  customerId: CustomerId;
  issued: string;
  lines: LineItem[];
  // 'LEGACY_PAPER' came from the pre-2019 desktop product. The importer that
  // created them was switched off when the last paper run went out.
  source: 'WEB' | 'BATCH' | 'LEGACY_PAPER';
  paid: boolean;
}

export interface Engineer {
  id: string;
  name: string;
  skills: string[];
}

export interface WorkOrder {
  id: string;
  customerId: CustomerId;
  address: string;
  requires: string;
  // Stored UTC.
  requestedAt: string;
  durationMinutes: number;
  status: 'QUEUED' | 'DISPATCHED' | 'DONE';
  engineerId?: string;
}

export const customers: Customer[] = [
  { id: 'C-1001', name: 'Mrs J Whitcombe', address: '14 Ashfield Row, Bristol', accountType: 'DOMESTIC', vatRegistered: false, sicDivision: null },
  // Food manufacturing, so SIC 1980 Division 4 and a relevant industrial
  // activity: their water falls outside the Group 2 zero rating.
  { id: 'C-1002', name: 'Trelawney Foods Ltd', address: 'Unit 6, Severnside Park, Avonmouth', accountType: 'COMMERCIAL', vatRegistered: true, sicDivision: 4 },
  { id: 'C-1003', name: 'Dr A Kowalski', address: '2 Bell Lane, Thornbury', accountType: 'DOMESTIC', vatRegistered: false, sicDivision: null },
  // A school. Division 9, other services, so not industrial: their water is
  // zero-rated even though the account is commercial and they are VAT registered.
  { id: 'C-1004', name: 'Severn Vale Academy', address: 'Gloucester Road, Thornbury', accountType: 'COMMERCIAL', vatRegistered: true, sicDivision: 9 },
];

export const invoices: Invoice[] = [
  {
    id: 'INV-9001', customerId: 'C-1001', issued: '2026-07-01', source: 'WEB', paid: true,
    lines: [
      { description: 'Metered supply, Q2', quantity: 41, unitPence: 218, kind: 'SUPPLY' },
      { description: 'Standing charge', quantity: 1, unitPence: 2400, kind: 'SUPPLY' },
    ],
  },
  {
    id: 'INV-9002', customerId: 'C-1002', issued: '2026-07-01', source: 'BATCH', paid: false,
    lines: [
      { description: 'Metered supply, Q2', quantity: 1120, unitPence: 195, kind: 'SUPPLY' },
      { description: 'Standing charge', quantity: 1, unitPence: 9600, kind: 'SUPPLY' },
      { description: 'Backflow device test', quantity: 2, unitPence: 8500, kind: 'SERVICE' },
    ],
  },
  {
    id: 'INV-9003', customerId: 'C-1003', issued: '2026-07-01', source: 'WEB', paid: false,
    lines: [
      { description: 'Metered supply, Q2', quantity: 33, unitPence: 218, kind: 'SUPPLY' },
      { description: 'Standing charge', quantity: 1, unitPence: 2400, kind: 'SUPPLY' },
      { description: 'Emergency call out', quantity: 1, unitPence: 14000, kind: 'SERVICE' },
    ],
  },
  {
    id: 'INV-9004', customerId: 'C-1004', issued: '2026-04-01', source: 'BATCH', paid: true,
    lines: [
      { description: 'Metered supply, Q1', quantity: 2840, unitPence: 195, kind: 'SUPPLY' },
      { description: 'Standing charge', quantity: 1, unitPence: 9600, kind: 'SUPPLY' },
    ],
  },
];

export const engineers: Engineer[] = [
  { id: 'E-01', name: 'Dean Prosser', skills: ['METER', 'LEAK'] },
  { id: 'E-02', name: 'Ify Nwosu', skills: ['METER', 'BACKFLOW', 'LEAK'] },
  { id: 'E-03', name: 'Ryan Betts', skills: ['LEAK'] },
];

export const workOrders: WorkOrder[] = [
  { id: 'W-5001', customerId: 'C-1001', address: '14 Ashfield Row, Bristol', requires: 'METER', requestedAt: '2026-09-02T08:00:00Z', durationMinutes: 60, status: 'QUEUED' },
  { id: 'W-5002', customerId: 'C-1001', address: '14 ashfield row, bristol', requires: 'LEAK', requestedAt: '2026-09-02T08:30:00Z', durationMinutes: 90, status: 'QUEUED' },
  { id: 'W-5003', customerId: 'C-1002', address: 'Unit 6, Severnside Park, Avonmouth', requires: 'BACKFLOW', requestedAt: '2026-09-02T09:00:00Z', durationMinutes: 45, status: 'QUEUED' },
  { id: 'W-5004', customerId: 'C-1003', address: '2 Bell Lane, Thornbury', requires: 'LEAK', requestedAt: '2026-09-02T13:00:00Z', durationMinutes: 60, status: 'QUEUED' },
  { id: 'W-5005', customerId: 'C-1004', address: 'Gloucester Road, Thornbury', requires: 'METER', requestedAt: '2026-09-02T13:30:00Z', durationMinutes: 30, status: 'QUEUED' },
  // Out of hours. Trelawney run a night shift and asked for the backflow test after close.
  { id: 'W-5006', customerId: 'C-1002', address: 'Unit 6, Severnside Park, Avonmouth', requires: 'BACKFLOW', requestedAt: '2026-09-02T23:30:00Z', durationMinutes: 45, status: 'QUEUED' },
];
