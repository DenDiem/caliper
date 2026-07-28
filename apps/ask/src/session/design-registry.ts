import {randomUUID, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import type {CaliperAnnotation} from '@caliper/core';

const tokensMatch = (provided: string | null, expected: string): boolean => {
  if (!provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
};

export interface DesignSessionState {
  id: string;
  token: string;
  target: string;
  createdAt: string;
  annotations: CaliperAnnotation[];
  submitted: boolean;
}

interface Entry {
  state: DesignSessionState;
  origin: string;
  allowedOrigins: string[];
  waiters: (() => void)[];
  sseListeners: (() => void)[];
}

// A live human-markup session: a growing list of annotations plus a submitted flag. Ephemeral by
// design (no persistence) — if the MCP server restarts, the developer starts a fresh caliper_design.
export class DesignRegistry {
  private readonly byId = new Map<string, Entry>();

  public open(target: string): DesignSessionState {
    const state: DesignSessionState = {
      id: randomUUID(),
      token: randomUUID(),
      target,
      createdAt: new Date().toISOString(),
      annotations: [],
      submitted: false,
    };
    this.byId.set(state.id, {state, origin: '', allowedOrigins: [], waiters: [], sseListeners: []});
    return state;
  }

  public setOrigin(id: string, origin: string, allowedOrigins: readonly string[]): void {
    const entry = this.require(id);
    entry.origin = origin;
    entry.allowedOrigins = [...allowedOrigins];
  }

  public addMark(id: string, annotation: CaliperAnnotation): DesignSessionState {
    const entry = this.require(id);
    entry.state = {...entry.state, annotations: [...entry.state.annotations, annotation]};
    this.flushSse(entry);
    return entry.state;
  }

  public submit(id: string): DesignSessionState {
    const entry = this.require(id);
    entry.state = {...entry.state, submitted: true};
    entry.waiters.splice(0).forEach((notify) => notify());
    this.flushSse(entry);
    return entry.state;
  }

  public get(id: string): DesignSessionState | undefined {
    return this.byId.get(id)?.state;
  }

  public wait(id: string, ms: number): Promise<DesignSessionState> {
    const entry = this.require(id);
    if (entry.state.submitted) return Promise.resolve(entry.state);
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
    if (!entry) throw new Error(`Unknown design session: ${id}`);
    return entry;
  }
}
