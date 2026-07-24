import {createServer} from 'node:http';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import httpProxy from 'http-proxy';
import {injectScriptTag} from '@caliper/core';
import {CLIENT_BUNDLE_PATH, CLIENT_PATH_PREFIX} from '../config';

const readClientBundle = (): string | null => {
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'client.js'), 'utf8');
  } catch {
    return null;
  }
};

export interface ProxyHandlers {
  api: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean;
}

export const startProxyServer = (opts: {
  target: string;
  sessionId: string;
  token: string;
  handlers: ProxyHandlers;
  onListen: (origin: string) => void;
}): {close: () => void} => {
  const proxy = httpProxy.createProxyServer({target: opts.target, selfHandleResponse: true, ws: true, changeOrigin: false});

  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('accept-encoding', 'identity');
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const type = proxyRes.headers['content-type'] ?? '';
    const isHtml = type.includes('text/html');
    const chunks: Buffer[] = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('error', () => {
      if (!res.headersSent) res.writeHead(502, {'content-type': 'text/html'});
      res.end();
    });
    proxyRes.on('end', () => {
      const headers = {...proxyRes.headers};
      if (isHtml) {
        delete headers['content-length'];
        delete headers['content-encoding'];
        const src = `${CLIENT_BUNDLE_PATH}?s=${opts.sessionId}&t=${opts.token}`;
        const body = injectScriptTag(Buffer.concat(chunks).toString('utf8'), src);
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        res.end(body);
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(Buffer.concat(chunks));
    });
  });

  proxy.on('error', (_err, _req, res) => {
    if ('writeHead' in res) {
      if (!res.headersSent) {
        res.writeHead(502, {'content-type': 'text/html'});
      }
      res.end('<h1>Caliper: dev server unreachable</h1><p>Is the target dev server running?</p>');
      return;
    }
    if ('destroy' in res) res.destroy();
  });

  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${port()}`;
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname === CLIENT_BUNDLE_PATH) {
      const bundle = readClientBundle();
      if (bundle === null) {
        res.writeHead(404, {'content-type': 'text/plain'});
        res.end('Not found');
        return;
      }
      res.writeHead(200, {'content-type': 'text/javascript'});
      res.end(bundle);
      return;
    }
    if (url.pathname.startsWith(CLIENT_PATH_PREFIX)) {
      if (opts.handlers.api(req, res, url)) return;
    }
    proxy.web(req, res);
  });

  server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));

  const port = (): number => {
    const address = server.address();
    return typeof address === 'object' && address ? address.port : 0;
  };

  server.listen(0, '127.0.0.1', () => opts.onListen(`http://127.0.0.1:${port()}`));
  return {close: () => {
    proxy.close();
    server.close();
  }};
};
