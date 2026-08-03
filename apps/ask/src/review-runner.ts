import {allAnswered, pendingRefs, toReviewToon} from '@caliper/core';
import type {AskPayload, ReviewSessionState} from '@caliper/core';
import {launchReviewBrowser} from './browser/launch';
import type {BrowserWindow} from './browser/launch';
import {SessionRegistry} from './session/registry';
import {startProxyServer} from './http/proxy-server';
import {startSnippetServer} from './http/snippet-server';
import {makeApiHandlers} from './http/api';
import {ASK_WINDOW_MS, buildSnippetTag, resolveMode, resolveSnippetPort} from './config';

export interface AskResult {
  completed: boolean;
  text: string;
  ticket: string;
}

interface ActiveSession {
  id: string;
  // What to open in the browser and show as the review url — the caliper server's own origin in
  // proxy mode, the app's real origin (unchanged) in snippet mode.
  reviewUrl: string;
  // Non-null in snippet mode: a status line reminding the developer the app must carry the snippet tag.
  snippetNotice: string | null;
  // The isolated --app browser window. The review client closes it on completion via window.close();
  // killing this process is a fallback that also frees resources. A no-op placeholder until
  // ensureSession launches the browser.
  window: BrowserWindow;
  close: () => void;
  // Guards teardown so the window/server close exactly once, whether the submit subscription or
  // settle's completed branch observes completion first.
  closed: boolean;
  // Drops the registry subscription that closes the window on submit; a no-op placeholder until
  // ensureSession wires the real subscription after launching the browser.
  unsubscribe: () => void;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

export const isLoopbackTarget = (target: string): boolean => {
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
  private starting: Promise<ActiveSession> | null = null;
  private injectionRisk: string | null = null;

  public async ask(payload: AskPayload): Promise<AskResult> {
    if (this.active) {
      const active = this.active;
      this.registry.merge(active.id, payload.zones);
      return this.settle(active);
    }

    const target = payload.target ?? this.defaultTarget();
    if (!target) throw noTargetError();
    if (!isLoopbackTarget(target)) throw nonLoopbackTargetError(target);

    const session = this.active ?? (await this.ensureSession(target));
    this.registry.merge(session.id, payload.zones);
    return this.settle(session);
  }

  public async wait(ticket: string): Promise<AskResult> {
    if (!ticket) {
      return {completed: false, ticket, text: 'Error: caliper_wait requires a non-empty "ticket".'};
    }
    if (this.active && this.active.id === ticket) {
      return this.settle(this.active);
    }

    const restored = this.registry.get(ticket);
    if (!restored) {
      return {
        completed: false,
        ticket,
        text:
          `Error: unknown review ticket "${ticket}". The session may have ended or the MCP server ` +
          'was restarted. Call caliper_ask again to start a new review.',
      };
    }

    if (allAnswered(restored)) {
      return {completed: true, ticket, text: toReviewToon(restored)};
    }

    const remainingRefs = pendingRefs(restored).join(', ');
    return {
      completed: false,
      ticket,
      text:
        'Error: this review session did not survive an MCP server restart — its browser page is gone. ' +
        `Call caliper_ask again with the remaining zones: ${remainingRefs}`,
    };
  }

  private defaultTarget(): string | undefined {
    return process.env.CALIPER_TARGET;
  }

  private async ensureSession(target: string): Promise<ActiveSession> {
    const active = this.active;
    if (active) return active;

    if (!this.starting) {
      this.starting = this.startSession(target)
        .then(async (session) => {
          session.window = await launchReviewBrowser(session.reviewUrl);
          session.unsubscribe = this.registry.subscribe(session.id, () => this.closeIfAnswered(session));
          return session;
        })
        .finally(() => {
          this.starting = null;
        });
    }

    return this.starting;
  }

  private startSession(target: string): Promise<ActiveSession> {
    return resolveMode() === 'snippet' ? this.startSnippetSession(target) : this.startProxySession(target);
  }

  private startProxySession(target: string): Promise<ActiveSession> {
    const state = this.registry.open(target);
    return new Promise<ActiveSession>((resolve, reject) => {
      const {close} = startProxyServer({
        target,
        sessionId: state.id,
        token: state.token,
        handlers: makeApiHandlers(this.registry, state.id),
        onListen: (origin) => {
          this.registry.setOrigin(state.id, origin, [origin]);
          const session: ActiveSession = {
            id: state.id,
            reviewUrl: origin,
            snippetNotice: null,
            window: {close: () => undefined, debugPort: null, isAlive: () => false},
            close,
            closed: false,
            unsubscribe: () => undefined,
          };
          this.active = session;
          resolve(session);
        },
        onInjectionRisk: (reason) => {
          this.injectionRisk = reason;
        },
        onError: (error) =>
          reject(new Error(`Failed to start review proxy server: ${error.message}`)),
      });
    });
  }

  private startSnippetSession(target: string): Promise<ActiveSession> {
    const state = this.registry.open(target);
    const port = resolveSnippetPort();
    const targetOrigin = new URL(target).origin;
    return new Promise<ActiveSession>((resolve, reject) => {
      const {close} = startSnippetServer({
        port,
        sessionId: state.id,
        token: state.token,
        handlers: makeApiHandlers(this.registry, state.id, {bootstrap: true}),
        allowedOrigin: targetOrigin,
        onListen: (origin) => {
          this.registry.setOrigin(state.id, origin, [targetOrigin]);
          const snippetNotice =
            'status: snippet mode active — the app must include ' +
            `${buildSnippetTag(port)} in its root HTML, or the review panel will not appear.`;
          const session: ActiveSession = {
            id: state.id,
            reviewUrl: target,
            snippetNotice,
            window: {close: () => undefined, debugPort: null, isAlive: () => false},
            close,
            closed: false,
            unsubscribe: () => undefined,
          };
          this.active = session;
          resolve(session);
        },
        onError: (error) =>
          reject(new Error(`Failed to start Caliper snippet server: ${error.message}`)),
      });
    });
  }

  // A poll before every zone is answered returns only a counter — never the full answers table, whose
  // per-zone question text would otherwise echo on each caliper_ask/caliper_wait. The answers arrive
  // once, in the final (completed) result.
  private pendingStatus(state: ReviewSessionState): string {
    return [
      'review:',
      `  id: ${state.id}`,
      `  count: ${state.zones.length}`,
      `  pending: ${pendingRefs(state).length}`,
    ].join('\n');
  }

  // Driven by the registry subscription: closes the window the moment the review becomes fully
  // answered, independent of whether a settle() is currently awaiting. Without this the window
  // survives when the developer submits between tool calls (no active waiter to trigger settle).
  private closeIfAnswered(session: ActiveSession): void {
    const state = this.registry.get(session.id);
    if (state && allAnswered(state)) this.teardown(session);
  }

  // Kills the review window, closes the proxy/snippet server, and clears the active session — once.
  // Both the submit subscription and settle's completed branch call this; the closed guard makes the
  // second call a no-op so the two paths never double-close or race.
  private teardown(session: ActiveSession): void {
    if (session.closed) return;
    session.closed = true;
    session.unsubscribe();
    session.window.close();
    session.close();
    if (this.active?.id === session.id) this.active = null;
  }

  private async settle(session: ActiveSession): Promise<AskResult> {
    const state = await this.registry.wait(session.id, ASK_WINDOW_MS);
    const completed = allAnswered(state);
    const reviewUrlLine = `review url: ${session.reviewUrl}`;
    const noticeLine = session.snippetNotice ? `\n${session.snippetNotice}` : '';
    const warningLine = this.injectionRisk
      ? '\nwarning: the app sent a Content-Security-Policy that may block Caliper' +
        `'s injected script (${this.injectionRisk}). If the review page looks empty, re-run ` +
        '`caliper init --mode snippet` and add the snippet tag instead.'
      : '';
    if (completed) {
      this.teardown(session);
      // The review url is omitted on the final result — the window has already closed, so it is only
      // actionable on the PENDING responses that precede completion.
      return {
        completed,
        ticket: session.id,
        text: `${toReviewToon(state)}${noticeLine}${warningLine}`,
      };
    }
    const pendingLine =
      `status: PENDING — not all zones answered. Call caliper_wait({ticket: "${session.id}"}) to continue.`;
    return {
      completed,
      ticket: session.id,
      text: `${this.pendingStatus(state)}\n\n${pendingLine}\n${reviewUrlLine}${noticeLine}${warningLine}`,
    };
  }
}
