import type {IncomingMessage, ServerResponse} from 'node:http';
import {elementContextSchema, verdictSchema} from '@caliper/core';
import {z} from 'zod';
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

const draftBodySchema = z.object({
  ref: z.string(),
  answer: z.string().nullish(),
  verdict: verdictSchema.nullish(),
});

const resolveBodySchema = z.object({
  ref: z.string(),
  target: elementContextSchema,
  route: z.string().nullish(),
});

const answersBodySchema = z.object({
  answers: z.array(
    z.object({
      ref: z.string(),
      answer: z.string(),
      verdict: verdictSchema.nullish(),
    }),
  ),
  // "Send & finish": after the drafted answers are posted, mark the session complete so unanswered
  // zones become `skipped` and the window closes. Absent/false keeps the legacy answer-only behaviour.
  final: z.boolean().nullish(),
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
  res.end('Invalid JSON body');
};

export interface ApiHandlersOptions {
  // Bootstrap hands out the session token to any caller presenting the app's Origin — necessary
  // in snippet mode (a static <script> tag can't carry a per-session token) but a token-issuance
  // hole in proxy mode, where the client never calls it: it reads ?s=&t= from its own script src.
  // Keep this opt-in so proxy mode never wires the route up.
  bootstrap?: boolean;
}

export const makeApiHandlers = (
  registry: SessionRegistry,
  sessionId: string,
  options: ApiHandlersOptions = {},
): ProxyHandlers => ({
  api(req, res, url) {
    if (url.pathname.endsWith('/bootstrap') && req.method === 'GET') {
      // Unwired in proxy mode: fall through to the caller's own 404 for the prefix instead of
      // reaching the token-gated routes below, so the route is indistinguishable from "unknown path".
      if (!options.bootstrap) return false;

      const allowedOrigin = registry.resolveAllowedOrigin(sessionId, req.headers.origin);
      if (!allowedOrigin) {
        res.writeHead(403).end();
        return true;
      }
      const state = registry.get(sessionId);
      if (!state) {
        res.writeHead(404).end();
        return true;
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': allowedOrigin,
        vary: 'Origin',
      });
      res.end(JSON.stringify({sessionId: state.id, token: state.token}));
      return true;
    }

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
          const parsed = draftBodySchema.safeParse(body);
          if (!parsed.success) {
            respondBadRequest(res);
            return;
          }
          registry.draft(sessionId, parsed.data.ref, {
            answer: parsed.data.answer ?? null,
            verdict: parsed.data.verdict ?? null,
          });
          res.writeHead(204).end();
        })
        .catch(() => respondBadRequest(res));
      return true;
    }

    if (url.pathname.endsWith('/resolve') && req.method === 'POST') {
      readJson(req)
        .then((body) => {
          const parsed = resolveBodySchema.safeParse(body);
          if (!parsed.success) {
            respondBadRequest(res);
            return;
          }
          registry.resolve(sessionId, parsed.data.ref, parsed.data.target, parsed.data.route ?? null);
          res.writeHead(204).end();
        })
        .catch(() => respondBadRequest(res));
      return true;
    }

    if (url.pathname.endsWith('/answers') && req.method === 'POST') {
      readJson(req)
        .then((body) => {
          const parsed = answersBodySchema.safeParse(body);
          if (!parsed.success) {
            respondBadRequest(res);
            return;
          }
          registry.submit(sessionId, parsed.data.answers);
          if (parsed.data.final) registry.finalize(sessionId);
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
