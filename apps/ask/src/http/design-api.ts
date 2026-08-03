import type {IncomingMessage, ServerResponse} from 'node:http';
import {caliperAnnotationSchema} from '@caliper/core';
import type {Box} from '@caliper/core';
import type {DesignRegistry} from '../session/design-registry';
import type {ProxyHandlers} from './proxy-server';

export type CaptureFn = (box: Box) => Promise<string | null>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isBox = (value: unknown): value is Box =>
  isRecord(value) &&
  typeof value.x === 'number' &&
  typeof value.y === 'number' &&
  typeof value.width === 'number' &&
  typeof value.height === 'number';

const readJson = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

const tokenFromRequest = (req: IncomingMessage, url: URL): string | null => {
  const fromQuery = url.searchParams.get('t');
  if (fromQuery !== null) return fromQuery;
  const header = req.headers['x-caliper-token'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header)) return header[0] ?? null;
  return null;
};

const respondBadRequest = (res: ServerResponse): void => {
  res.writeHead(400, {'content-type': 'text/plain'});
  res.end('Invalid request body');
};

export const makeDesignApiHandlers = (
  registry: DesignRegistry,
  sessionId: string,
  capture: CaptureFn,
): ProxyHandlers => ({
  api(req, res, url) {
    if (!registry.authorize(sessionId, req, tokenFromRequest(req, url))) {
      res.writeHead(403).end();
      return true;
    }

    if (url.pathname.endsWith('/state') && req.method === 'GET') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(registry.get(sessionId)));
      return true;
    }

    if (url.pathname.endsWith('/marks') && req.method === 'POST') {
      readJson(req)
        .then((body) => {
          const parsed = caliperAnnotationSchema.safeParse(body);
          if (!parsed.success) {
            respondBadRequest(res);
            return;
          }
          registry.addMark(sessionId, parsed.data);
          res.writeHead(204).end();
        })
        .catch(() => respondBadRequest(res));
      return true;
    }

    if (url.pathname.endsWith('/capture') && req.method === 'POST') {
      readJson(req)
        .then(async (body) => {
          if (!isBox(body)) {
            respondBadRequest(res);
            return;
          }
          const image = await capture(body);
          res.writeHead(200, {'content-type': 'application/json'});
          res.end(JSON.stringify({image}));
        })
        .catch(() => respondBadRequest(res));
      return true;
    }

    if (url.pathname.endsWith('/submit') && req.method === 'POST') {
      registry.submit(sessionId);
      res.writeHead(204).end();
      return true;
    }

    if (url.pathname.endsWith('/events') && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const push = (): void => {
        res.write(`event: state\ndata: ${JSON.stringify(registry.get(sessionId))}\n\n`);
      };
      push();
      const unsubscribe = registry.subscribe(sessionId, push);
      req.on('close', unsubscribe);
      return true;
    }

    return false;
  },
});
