import type {IncomingMessage, ServerResponse} from 'node:http';
import type {Verdict} from '@caliper/core';
import type {SessionRegistry} from '../session/registry';
import type {ProxyHandlers} from './proxy-server';

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

interface DraftBody {
  ref: string;
  answer?: string;
  verdict?: Verdict | null;
}

interface AnswersBody {
  answers: {ref: string; answer: string; verdict?: Verdict | null}[];
}

const isDraftBody = (value: unknown): value is DraftBody =>
  typeof value === 'object' && value !== null && 'ref' in value && typeof value.ref === 'string';

const isAnswersBody = (value: unknown): value is AnswersBody =>
  typeof value === 'object' && value !== null && 'answers' in value && Array.isArray(value.answers);

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
  res.end('Invalid JSON body');
};

export const makeApiHandlers = (registry: SessionRegistry, sessionId: string): ProxyHandlers => ({
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

    if (url.pathname.endsWith('/drafts') && req.method === 'POST') {
      readJson(req)
        .then((body) => {
          if (isDraftBody(body)) {
            registry.draft(sessionId, body.ref, {answer: body.answer ?? null, verdict: body.verdict ?? null});
          }
          res.writeHead(204).end();
        })
        .catch(() => respondBadRequest(res));
      return true;
    }

    if (url.pathname.endsWith('/answers') && req.method === 'POST') {
      readJson(req)
        .then((body) => {
          if (isAnswersBody(body)) {
            registry.submit(sessionId, body.answers);
          }
          res.writeHead(204).end();
        })
        .catch(() => respondBadRequest(res));
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
