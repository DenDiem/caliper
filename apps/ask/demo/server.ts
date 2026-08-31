import {createServer} from 'node:http';
import {renderCheckoutPage} from './checkout-page';
import {renderListingPage} from './listing-page';
import {renderSearchPage} from './search-page';

const PORT = 5599;
const HOST = '127.0.0.1';

const routes: Record<string, () => string> = {
  '/': renderListingPage,
  '/search': renderSearchPage,
  '/checkout': renderCheckoutPage,
};

// Deliberately stateful: the first order is accepted, every later one is rejected the way a duplicate
// key would be. The checkout page's bug is that it never checks the status, so the second attempt walks
// into the success path — a defect that only exists as a sequence, which is what a trace is for.
let ordersPlaced = 0;

createServer((req, res) => {
  const {pathname} = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    req.resume();
    req.on('end', () => {
      ordersPlaced += 1;
      const duplicate = ordersPlaced > 1;
      res.writeHead(duplicate ? 409 : 201, {'content-type': 'application/json'});
      res.end(
        duplicate
          ? JSON.stringify({error: 'duplicate order id'})
          : JSON.stringify({orderId: 'ORD-4417', total: 12287}),
      );
    });
    return;
  }

  if (pathname === '/api/orders' && req.method === 'DELETE') {
    ordersPlaced = 0;
    res.writeHead(204);
    res.end();
    return;
  }

  const render = routes[pathname];

  if (!render) {
    res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }

  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
  res.end(render());
}).listen(PORT, HOST, () => process.stdout.write(`demo target: http://${HOST}:${PORT}\n`));
