import {createServer} from 'node:http';
import {renderListingPage} from './listing-page';
import {renderSearchPage} from './search-page';

const PORT = 5599;
const HOST = '127.0.0.1';

const routes: Record<string, () => string> = {
  '/': renderListingPage,
  '/search': renderSearchPage,
};

createServer((req, res) => {
  const {pathname} = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  if (pathname === '/favicon.ico') {
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
