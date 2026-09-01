// Prints every slot as stable JSON. The timezone matrix test runs this under a
// range of TZ values to prove the output does not depend on the clock of the box
// the process happens to be on.
import { slotsFor } from '../../src/scheduling/slots.ts';
import { workOrders } from '../../src/db.ts';

process.stdout.write(JSON.stringify(slotsFor(workOrders), null, 2));
