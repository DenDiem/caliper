import {randomUUID} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {addZones, allAnswered, createSession, setDraft, submitAnswers} from '@caliper/core';
import type {ReviewSessionState, ReviewZone, Verdict} from '@caliper/core';
import {load, persist} from './persistence.js';

interface Entry {
  state: ReviewSessionState;
  origin: string; // e.g. http://127.0.0.1:49871 — set by setOrigin after the proxy binds
  waiters: (() => void)[];
  sseListeners: (() => void)[];
}

export class SessionRegistry {
  private readonly byId = new Map<string, Entry>();

  public open(target: string): ReviewSessionState {
    const state = createSession({id: randomUUID(), token: randomUUID(), target, createdAt: new Date().toISOString()});
    this.byId.set(state.id, {state, origin: '', waiters: [], sseListeners: []});
    persist(state);
    return state;
  }

  public setOrigin(id: string, origin: string): void {
    this.require(id).origin = origin;
  }

  public draft(id: string, ref: string, patch: {answer?: string | null; verdict?: Verdict | null}): ReviewSessionState {
    const entry = this.require(id);
    entry.state = setDraft(entry.state, ref, patch);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public get(id: string): ReviewSessionState | undefined {
    const entry = this.byId.get(id);
    if (entry) return entry.state;
    const restored = load(id);
    if (restored) this.byId.set(id, {state: restored, origin: '', waiters: [], sseListeners: []});
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
    entry.waiters.splice(0).forEach((resolve) => resolve());
    this.flushSse(entry);
    return entry.state;
  }

  public wait(id: string, ms: number): Promise<ReviewSessionState> {
    const entry = this.require(id);
    if (allAnswered(entry.state)) return Promise.resolve(entry.state);
    return new Promise((resolve) => {
      const timer = setTimeout(finish, ms);
      const waiter = () => finish();
      entry.waiters.push(waiter);
      function finish() {
        clearTimeout(timer);
        resolve(entry.state);
      }
    });
  }

  public authorize(id: string, req: IncomingMessage, token: string | null): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    if (token !== entry.state.token) return false;
    const origin = req.headers.origin;
    if (origin && origin !== entry.origin) return false;
    const host = req.headers.host;
    return !host || `http://${host}` === entry.origin || `https://${host}` === entry.origin;
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
