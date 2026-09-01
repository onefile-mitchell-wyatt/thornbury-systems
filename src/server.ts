import { createServer } from 'node:http';
import { customers, invoices, workOrders } from './db.ts';
import { totalFor, outstandingFor } from './invoices/calc.ts';
import { dispatch } from './scheduling/dispatch.ts';
import { slotsFor } from './scheduling/slots.ts';
import { format } from './shared/money.ts';

const PORT = Number(process.env.PORT ?? 4310);

function json(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length === 0) {
    return json(res, 200, {
      service: 'Thornbury Systems billing and scheduling',
      version: '3.11.2',
      routes: [
        'GET /customers',
        'GET /customers/:id',
        'GET /customers/:id/invoices',
        'GET /invoices/:id',
        'GET /work-orders',
        'GET /dispatch',
        'GET /slots',
      ],
    });
  }

  if (parts[0] === 'customers' && parts.length === 1) {
    return json(res, 200, customers);
  }

  if (parts[0] === 'customers' && parts.length === 2) {
    const customer = customers.find((c) => c.id === parts[1]);
    if (!customer) return json(res, 404, { error: 'no such customer' });
    const outstanding = outstandingFor(customer, invoices);
    return json(res, 200, {
      ...customer,
      outstanding: format(outstanding),
      // Pence as well, so the front end stops parsing the formatted string.
      outstandingPence: outstanding,
    });
  }

  if (parts[0] === 'customers' && parts.length === 3 && parts[2] === 'invoices') {
    return json(res, 200, invoices.filter((i) => i.customerId === parts[1]));
  }

  if (parts[0] === 'invoices' && parts.length === 2) {
    const invoice = invoices.find((i) => i.id === parts[1]);
    if (!invoice) return json(res, 404, { error: 'no such invoice' });
    const customer = customers.find((c) => c.id === invoice.customerId);
    if (!customer) {
      // The VAT rate depends on who the invoice is for, so an orphaned invoice
      // cannot be priced. A plausible wrong number is worse than an error, and
      // this is our data being wrong rather than the caller asking for the
      // wrong thing, so it is a 500 and not the 404 above.
      return json(res, 500, { error: 'invoice references an unknown customer' });
    }
    const totals = totalFor(invoice, customer);
    return json(res, 200, {
      ...invoice,
      ...totals,
      display: format(totals.gross),
      // Pence stay machine-readable in 'bands'; these are the strings to print.
      vatDisplay: {
        net: format(totals.net),
        vat: format(totals.vat),
        gross: format(totals.gross),
        bands: totals.bands.map((b) => ({
          rate: `${b.rate}%`,
          net: format(b.net),
          vat: format(b.vat),
        })),
      },
    });
  }

  if (parts[0] === 'work-orders') {
    return json(res, 200, workOrders);
  }

  if (parts[0] === 'dispatch') {
    return json(res, 200, dispatch(workOrders));
  }

  if (parts[0] === 'slots') {
    return json(res, 200, slotsFor(workOrders));
  }

  return json(res, 404, { error: 'no such route', path: url.pathname });
});

if (process.argv[1]?.endsWith('server.ts')) {
  server.listen(PORT, () => {
    console.log(`Thornbury Systems listening on http://localhost:${PORT}`);
  });
}
