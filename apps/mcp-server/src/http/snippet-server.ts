import {createServer} from 'node:http';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {CLIENT_BUNDLE_PATH, CLIENT_PATH_PREFIX} from '../config';

const readClientBundle = (): string | null => {
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'client.js'), 'utf8');
  } catch {
    return null;
  }
};

export interface SnippetHandlers {
  api: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean;
}

const CORS_ALLOW_HEADERS = 'content-type, x-caliper-token';
const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';

const applyCors = (req: IncomingMessage, res: ServerResponse, allowedOrigin: string): void => {
  const origin = req.headers.origin;
  if (!origin || origin !== allowedOrigin) return;
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('vary', 'Origin');
};

const isPortInUseError = (error: NodeJS.ErrnoException): boolean => error.code === 'EADDRINUSE';

export const startSnippetServer = (opts: {
  port: number;
  sessionId: string;
  token: string;
  handlers: SnippetHandlers;
  allowedOrigin: string;
  onListen: (origin: string) => void;
  onError?: (error: Error) => void;
}): {close: () => void} => {
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${opts.port}`;
    const url = new URL(req.url ?? '/', origin);

    if (!url.pathname.startsWith(CLIENT_PATH_PREFIX)) {
      res.writeHead(404, {'content-type': 'text/plain'});
      res.end('Not found');
      return;
    }

    applyCors(req, res, opts.allowedOrigin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-headers': CORS_ALLOW_HEADERS,
        'access-control-allow-methods': CORS_ALLOW_METHODS,
      });
      res.end();
      return;
    }

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

    if (opts.handlers.api(req, res, url)) return;
    res.writeHead(404, {'content-type': 'text/plain'});
    res.end('Not found');
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (isPortInUseError(error)) {
      opts.onError?.(
        new Error(
          `Caliper snippet server could not bind 127.0.0.1:${opts.port} — the port is already in use. ` +
            'Stop whatever is using it, or set CALIPER_PORT to a free port.',
        ),
      );
      return;
    }
    opts.onError?.(error);
  });

  server.listen(opts.port, '127.0.0.1', () => opts.onListen(`http://127.0.0.1:${opts.port}`));

  return {
    close: () => {
      server.close();
    },
  };
};
