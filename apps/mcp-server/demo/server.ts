import {createServer} from 'node:http';

const page = (route: string): string =>
  `<!doctype html><html><head><title>Caliper demo — ${route}</title></head>
<body>
  <h1>Demo (${route})</h1>
  <button data-caliper-ref="z-cta">Primary action</button>
  <aside data-caliper-ref="z-sidebar" style="width:220px;height:140px;border:1px solid #ccc">sidebar</aside>
  <nav><a href="/">home</a> <a href="/orders">orders</a></nav>
</body></html>`;

createServer((req, res) => {
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
  res.end(page(req.url ?? '/'));
}).listen(5599, '127.0.0.1', () => process.stdout.write('demo target: http://127.0.0.1:5599\n'));
