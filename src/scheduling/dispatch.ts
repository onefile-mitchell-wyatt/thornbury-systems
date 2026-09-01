import { engineers as roster, type Engineer, type WorkOrder } from '../db.ts';
import { sameUkDay } from '../shared/dates.ts';

export interface Assignment {
  workOrderId: string;
  engineerId: string;
  address: string;
  startsAt: string;
  durationMinutes: number;
}

// Why a work order the dispatcher was given did not make it into the plan.
// It used to just not appear, which is how a leak repair could sit QUEUED for
// weeks with nobody in support able to see that it had been passed over.
export interface Suppression {
  workOrderId: string;
  reason: 'DUPLICATE_ADDRESS' | 'NO_ENGINEER_AVAILABLE' | 'NO_SKILLED_ENGINEER';
  // The work order already going to that address, for DUPLICATE_ADDRESS.
  clashesWith?: string;
  // The skill that could not be covered, for the two engineer reasons.
  detail?: string;
}

export interface DispatchResult {
  plan: Assignment[];
  suppressed: Suppression[];
}

// A commitment against a house and, once assigned, against an engineer's day.
// Covers both work already dispatched and work planned by this run.
interface Visit {
  workOrderId: string;
  engineerId?: string;
  // Normalised. Compare these, never the raw string.
  address: string;
  startsAt: Date;
  endsAt: Date;
}

function canDo(engineer: Engineer, order: WorkOrder): boolean {
  return engineer.skills.includes(order.requires);
}

// Addresses are typed in by whoever takes the call, so the same house arrives
// spelled differently: different case, stray spaces, a trailing full stop.
// Compare on a normalised form, not the raw string.
function normaliseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/, '')
    .trim();
}

function visitFor(order: WorkOrder): Visit {
  const startsAt = new Date(order.requestedAt);
  return {
    workOrderId: order.id,
    engineerId: order.engineerId,
    address: normaliseAddress(order.address),
    startsAt,
    endsAt: new Date(startsAt.getTime() + order.durationMinutes * 60_000),
  };
}

function overlaps(a: Visit, b: Visit): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

// One visit per address per day. Sending two vans to the same house on the same
// morning is the single biggest source of complaints on the support queue.
//
// The day is a UK day, because that is the day the customer means. Counting UTC
// days put the boundary at 23:00 local through British Summer Time, which both
// let duplicates past after local midnight and dropped genuine out of hours
// work that had rolled over into the next UK day.
function visitAlreadyBooked(visit: Visit, book: Visit[]): Visit | undefined {
  return book.find(
    (booked) => booked.address === visit.address && sameUkDay(booked.startsAt, visit.startsAt),
  );
}

function isFree(engineerId: string, visit: Visit, book: Visit[]): boolean {
  return !book.some((booked) => booked.engineerId === engineerId && overlaps(booked, visit));
}

export function dispatch(orders: WorkOrder[], engineers: Engineer[] = roster): DispatchResult {
  const plan: Assignment[] = [];
  const suppressed: Suppression[] = [];

  // Work that is already committed. Without this the check only ever saw the
  // plan built by this one call, so a second call taken later the same day sent
  // a second van to a house the morning run had already covered.
  const addressBook: Visit[] = [];
  const engineerBook: Visit[] = [];

  for (const order of orders) {
    if (order.status !== 'DISPATCHED' && order.status !== 'DONE') continue;
    const visit = visitFor(order);
    // A van is going, or went, to that house that day either way.
    addressBook.push(visit);
    // Only a future commitment holds an engineer's time. DONE is in the past.
    if (order.status === 'DISPATCHED' && visit.engineerId) engineerBook.push(visit);
  }

  // Earliest requested visit wins a clash. Insertion order is arbitrary, and an
  // arbitrary winner makes the suppressed report meaningless.
  const queued = orders
    .filter((order) => order.status === 'QUEUED')
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());

  for (const order of queued) {
    const visit = visitFor(order);

    const clash = visitAlreadyBooked(visit, addressBook);
    if (clash) {
      suppressed.push({
        workOrderId: order.id,
        reason: 'DUPLICATE_ADDRESS',
        clashesWith: clash.workOrderId,
      });
      continue;
    }

    const skilled = engineers.filter((engineer) => canDo(engineer, order));
    if (skilled.length === 0) {
      suppressed.push({
        workOrderId: order.id,
        reason: 'NO_SKILLED_ENGINEER',
        detail: order.requires,
      });
      continue;
    }

    // Skilled is not the same as free. This used to take the first engineer with
    // the skill and never look at durationMinutes, so one engineer was handed
    // overlapping jobs while another sat unassigned all day.
    const engineer = skilled.find((candidate) => isFree(candidate.id, visit, engineerBook));
    if (!engineer) {
      suppressed.push({
        workOrderId: order.id,
        reason: 'NO_ENGINEER_AVAILABLE',
        detail: order.requires,
      });
      continue;
    }

    visit.engineerId = engineer.id;
    addressBook.push(visit);
    engineerBook.push(visit);

    plan.push({
      workOrderId: order.id,
      engineerId: engineer.id,
      address: order.address,
      startsAt: order.requestedAt,
      durationMinutes: order.durationMinutes,
    });
  }

  return { plan, suppressed };
}
