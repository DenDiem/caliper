import open from 'open';
import {allAnswered, toReviewToon} from '@caliper/core';
import type {AskPayload} from '@caliper/core';
import {SessionRegistry} from './session/registry';
import {startProxyServer} from './http/proxy-server';
import {makeApiHandlers} from './http/api';
import {ASK_WINDOW_MS} from './config';

export interface AskResult {
  completed: boolean;
  text: string;
  ticket: string;
}

interface ActiveSession {
  id: string;
  origin: string;
  close: () => void;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

const isLoopbackTarget = (target: string): boolean => {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  return LOOPBACK_HOSTNAMES.has(url.hostname);
};

const noTargetError = (): Error =>
  new Error(
    'No preview target configured. Set the CALIPER_TARGET environment variable ' +
      '(e.g. CALIPER_TARGET=http://127.0.0.1:5599, pinned by `caliper init`) or pass "target" explicitly in the caliper_ask call.',
  );

const nonLoopbackTargetError = (target: string): Error =>
  new Error(
    `Refusing to proxy "${target}": caliper_ask only proxies loopback dev servers ` +
      '(127.0.0.1 / localhost / [::1]). Point CALIPER_TARGET (or the "target" argument) at your local dev server.',
  );

export class ReviewRunner {
  private readonly registry = new SessionRegistry();
  private active: ActiveSession | null = null;

  public async ask(payload: AskPayload): Promise<AskResult> {
    if (this.active) {
      const active = this.active;
      this.registry.merge(active.id, payload.zones);
      return this.settle(active.id, active.origin);
    }

    const target = payload.target ?? this.defaultTarget();
    if (!target) throw noTargetError();
    if (!isLoopbackTarget(target)) throw nonLoopbackTargetError(target);

    const session = await this.startSession(target);
    this.registry.merge(session.id, payload.zones);
    await open(session.origin);
    return this.settle(session.id, session.origin);
  }

  public async wait(ticket: string): Promise<AskResult> {
    if (!ticket) {
      return {completed: false, ticket, text: 'Error: caliper_wait requires a non-empty "ticket".'};
    }
    if (!this.active || this.active.id !== ticket) {
      return {
        completed: false,
        ticket,
        text:
          `Error: unknown review ticket "${ticket}". The session may have ended or the MCP server ` +
          'was restarted. Call caliper_ask again to start a new review.',
      };
    }
    return this.settle(this.active.id, this.active.origin);
  }

  private defaultTarget(): string | undefined {
    return process.env.CALIPER_TARGET;
  }

  private startSession(target: string): Promise<ActiveSession> {
    const state = this.registry.open(target);
    return new Promise<ActiveSession>((resolve) => {
      const {close} = startProxyServer({
        target,
        sessionId: state.id,
        token: state.token,
        handlers: makeApiHandlers(this.registry, state.id),
        onListen: (origin) => {
          this.registry.setOrigin(state.id, origin);
          const session: ActiveSession = {id: state.id, origin, close};
          this.active = session;
          resolve(session);
        },
      });
    });
  }

  private async settle(id: string, origin: string): Promise<AskResult> {
    const state = await this.registry.wait(id, ASK_WINDOW_MS);
    const completed = allAnswered(state);
    const toon = toReviewToon(state);
    const reviewUrlLine = `review url: ${origin}`;
    if (completed) {
      return {completed, ticket: id, text: `${toon}\n\n${reviewUrlLine}`};
    }
    const pendingLine = `status: PENDING — not all zones answered. Call caliper_wait({ticket: "${id}"}) to continue.`;
    return {completed, ticket: id, text: `${toon}\n\n${pendingLine}\n${reviewUrlLine}`};
  }
}
