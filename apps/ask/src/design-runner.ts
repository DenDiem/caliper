import {toToon} from '@caliper/core';
import type {CaliperSession} from '@caliper/core';
import {launchDesignBrowser} from './browser/launch';
import type {BrowserWindow} from './browser/launch';
import {makeDesignApiHandlers} from './http/design-api';
import {startProxyServer} from './http/proxy-server';
import {DesignRegistry} from './session/design-registry';
import type {DesignSessionState} from './session/design-registry';
import {isLoopbackTarget} from './review-runner';
import {ASK_WINDOW_MS, CALIPER_VERSION} from './config';

export interface DesignResult {
  completed: boolean;
  text: string;
  ticket: string;
}

export interface DesignPayload {
  target?: string;
}

interface ActiveDesign {
  id: string;
  reviewUrl: string;
  window: BrowserWindow;
  close: () => void;
}

const noTargetError = (): Error =>
  new Error(
    'No preview target configured. Set CALIPER_TARGET (e.g. CALIPER_TARGET=http://127.0.0.1:5173, ' +
      'pinned by `caliper init`) or pass "target" in the caliper_design call.',
  );

const nonLoopbackTargetError = (target: string): Error =>
  new Error(
    `Refusing to open "${target}": caliper_design only opens loopback dev servers ` +
      '(127.0.0.1 / localhost / [::1]). Point CALIPER_TARGET (or "target") at your local dev server.',
  );

export class DesignRunner {
  private readonly registry = new DesignRegistry();
  private active: ActiveDesign | null = null;
  private starting: Promise<ActiveDesign> | null = null;
  private injectionRisk: string | null = null;

  public async design(payload: DesignPayload): Promise<DesignResult> {
    if (this.active) return this.settle(this.active);

    const target = payload.target ?? process.env.CALIPER_TARGET;
    if (!target) throw noTargetError();
    if (!isLoopbackTarget(target)) throw nonLoopbackTargetError(target);

    const session = await this.ensureSession(target);
    return this.settle(session);
  }

  private async ensureSession(target: string): Promise<ActiveDesign> {
    if (this.active) return this.active;

    if (!this.starting) {
      this.starting = this.startSession(target)
        .then(async (session) => {
          session.window = await launchDesignBrowser(session.reviewUrl);
          return session;
        })
        .finally(() => {
          this.starting = null;
        });
    }

    return this.starting;
  }

  private startSession(target: string): Promise<ActiveDesign> {
    const state = this.registry.open(target);
    return new Promise<ActiveDesign>((resolve, reject) => {
      const {close} = startProxyServer({
        target,
        sessionId: state.id,
        token: state.token,
        clientMode: 'design',
        handlers: makeDesignApiHandlers(this.registry, state.id),
        onListen: (origin) => {
          this.registry.setOrigin(state.id, origin, [origin]);
          const session: ActiveDesign = {
            id: state.id,
            reviewUrl: origin,
            window: {close: () => undefined},
            close,
          };
          this.active = session;
          resolve(session);
        },
        onInjectionRisk: (reason) => {
          this.injectionRisk = reason;
        },
        onError: (error) => reject(new Error(`Failed to start design proxy server: ${error.message}`)),
      });
    });
  }

  private async settle(session: ActiveDesign): Promise<DesignResult> {
    const state = await this.registry.wait(session.id, ASK_WINDOW_MS);
    const warning = this.injectionRisk
      ? "\nwarning: the app sent a Content-Security-Policy that may block Caliper's injected script " +
        `(${this.injectionRisk}). If the window looks empty, the design overlay could not load.`
      : '';

    if (state.submitted) {
      session.window.close();
      session.close();
      if (this.active?.id === session.id) this.active = null;
      return {
        completed: true,
        ticket: session.id,
        text: `${this.toon(state)}\n\nreview url: ${session.reviewUrl}${warning}`,
      };
    }

    return {
      completed: false,
      ticket: session.id,
      text:
        `${this.toon(state)}\n\nstatus: PENDING — the developer has not submitted yet. ` +
        `Call caliper_design again to keep waiting.\nreview url: ${session.reviewUrl}${warning}`,
    };
  }

  private toon(state: DesignSessionState): string {
    const session: CaliperSession = {
      schemaVersion: 1,
      id: state.id,
      createdAt: state.createdAt,
      caliperVersion: CALIPER_VERSION,
      annotations: state.annotations,
      assets: {},
    };
    return toToon(session);
  }
}
