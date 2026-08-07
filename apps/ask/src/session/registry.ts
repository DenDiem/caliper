import {randomUUID, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {addZones, createSession, finalizeSession, isComplete, resolveZone, setDraft, submitAnswers} from '@caliper/core';
import type {ElementContext, ReviewSessionState, ReviewZone, Verdict} from '@caliper/core';
import {load, persist} from './persistence';

const tokensMatch = (provided: string | null, expected: string): boolean => {
  if (!provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

interface Entry {
  state: ReviewSessionState;
  // Where Caliper's own HTTP server is reachable — checked against the request Host header.
  // Proxy mode: the ephemeral proxy origin. Snippet mode: http://127.0.0.1:<port>.
  origin: string;
  // Acceptable values of the request Origin header.
  // Proxy mode: [proxyOrigin] (same-origin as today). Snippet mode: [targetOrigin] (the app's real origin).
  allowedOrigins: string[];
  waiters: (() => void)[];
  sseListeners: (() => void)[];
}

export class SessionRegistry {
  private readonly byId = new Map<string, Entry>();

  public open(target: string): ReviewSessionState {
    const state = createSession({id: randomUUID(), token: randomUUID(), target, createdAt: new Date().toISOString()});
    this.byId.set(state.id, {state, origin: '', allowedOrigins: [], waiters: [], sseListeners: []});
    persist(state);
    return state;
  }

  public setOrigin(id: string, origin: string, allowedOrigins: readonly string[]): void {
    const entry = this.require(id);
    entry.origin = origin;
    entry.allowedOrigins = [...allowedOrigins];
  }

  public draft(id: string, ref: string, patch: {answer?: string | null; verdict?: Verdict | null}): ReviewSessionState {
    const entry = this.require(id);
    entry.state = setDraft(entry.state, ref, patch);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public resolve(id: string, ref: string, target: ElementContext, route: string | null): ReviewSessionState {
    const entry = this.require(id);
    entry.state = resolveZone(entry.state, ref, target, route);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public get(id: string): ReviewSessionState | undefined {
    const entry = this.byId.get(id);
    if (entry) return entry.state;
    const restored = load(id);
    if (restored) this.byId.set(id, {state: restored, origin: '', allowedOrigins: [], waiters: [], sseListeners: []});
    return restored ?? undefined;
  }

  public merge(id: string, zones: readonly ReviewZone[]): ReviewSessionState {
    const entry = this.require(id);
    entry.state = addZones(entry.state, zones);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public submit(id: string, answers: readonly {ref: string; answer: string; verdict?: Verdict | null}[]): ReviewSessionState {
    const entry = this.require(id);
    entry.state = submitAnswers(entry.state, answers);
    persist(entry.state);
    entry.waiters.splice(0).forEach((notify) => notify());
    this.flushSse(entry);
    return entry.state;
  }

  // "Send & finish": marks the session complete so unanswered zones read as `skipped`, then wakes any
  // waiter and SSE subscriber so the runner tears the window down and caliper_ask returns COMPLETED.
  public finalize(id: string): ReviewSessionState {
    const entry = this.require(id);
    entry.state = finalizeSession(entry.state);
    persist(entry.state);
    entry.waiters.splice(0).forEach((notify) => notify());
    this.flushSse(entry);
    return entry.state;
  }

  public wait(id: string, ms: number): Promise<ReviewSessionState> {
    const entry = this.require(id);
    if (isComplete(entry.state)) return Promise.resolve(entry.state);
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        entry.waiters = entry.waiters.filter((item) => item !== waiter);
        resolve(entry.state);
      };
      const waiter = finish;
      const timer = setTimeout(finish, ms);
      entry.waiters.push(waiter);
    });
  }

  public authorize(id: string, req: IncomingMessage, token: string | null): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    if (!tokensMatch(token, entry.state.token)) return false;
    const host = req.headers.host;
    if (!host) return false;
    if (`http://${host}` !== entry.origin && `https://${host}` !== entry.origin) return false;
    const origin = req.headers.origin;
    if (origin && !entry.allowedOrigins.includes(origin)) return false;
    return true;
  }

  // Resolves the request's Origin header to an allowed value, or null when it isn't one —
  // lets the API layer echo it back as Access-Control-Allow-Origin (never "*") on cross-origin routes.
  public resolveAllowedOrigin(id: string, requestOrigin: string | undefined): string | null {
    const entry = this.byId.get(id);
    if (!entry || !requestOrigin) return null;
    return entry.allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
  }

  public subscribe(id: string, listener: () => void): () => void {
    const entry = this.require(id);
    entry.sseListeners.push(listener);
    return () => {
      entry.sseListeners = entry.sseListeners.filter((item) => item !== listener);
    };
  }

  private flushSse(entry: Entry): void {
    entry.sseListeners.forEach((listener) => listener());
  }

  private require(id: string): Entry {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`Unknown review session: ${id}`);
    return entry;
  }
}
