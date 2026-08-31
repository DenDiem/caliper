import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {toToon} from '@caliper/core';
import type {Box, CaliperSession} from '@caliper/core';
import {launchDesignBrowser} from './browser/launch';
import type {BrowserWindow} from './browser/launch';
import {isTargetReachable, unreachableTargetError} from './browser/reachable';
import {createCdpConnection} from './browser/cdp';
import type {CdpConnection} from './browser/cdp';
import {makeDesignApiHandlers} from './http/design-api';
import {startProxyServer} from './http/proxy-server';
import {DesignRegistry} from './session/design-registry';
import type {DesignSessionState} from './session/design-registry';
import {isLoopbackTarget} from './review-runner';
import {resolveTarget} from './targets';
import {ASK_WINDOW_MS, CALIPER_VERSION} from './config';

const ID_SHORT = 8;

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
  debugPort: number | null;
  connection: CdpConnection | null;
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
    if (this.active) {
      const note = await this.refreshActiveWindow(this.active);
      return this.settle(this.active, note);
    }

    const target = resolveTarget(payload.target);
    if (!target) throw noTargetError();
    if (!isLoopbackTarget(target)) throw nonLoopbackTargetError(target);
    if (!(await isTargetReachable(target))) throw unreachableTargetError(target);

    const session = await this.ensureSession(target);
    return this.settle(session);
  }

  // Reusing an unsubmitted session never relaunches a live window (that would spawn a duplicate). If the
  // developer closed it, relaunch at the same review url and rebuild the CDP connection for the new
  // window's debug port. Either way return a note for the PENDING result so the agent can tell the
  // developer the window's state instead of waiting silently against a window that may be gone.
  private async refreshActiveWindow(session: ActiveDesign): Promise<string> {
    if (session.window.isAlive()) {
      return `note: reused the open review session — if you closed the window, reopen: ${session.reviewUrl}`;
    }
    session.connection?.close();
    session.window = await launchDesignBrowser(session.reviewUrl);
    session.debugPort = session.window.debugPort;
    session.connection = await this.openConnection(session.debugPort);
    return `note: the review window had been closed — reopened it at ${session.reviewUrl}`;
  }

  private openConnection(debugPort: number | null): Promise<CdpConnection | null> {
    return debugPort === null ? Promise.resolve(null) : createCdpConnection(debugPort);
  }

  private async ensureSession(target: string): Promise<ActiveDesign> {
    if (this.active) return this.active;

    if (!this.starting) {
      this.starting = this.startSession(target)
        .then(async (session) => {
          session.window = await launchDesignBrowser(session.reviewUrl);
          session.debugPort = session.window.debugPort;
          session.connection = await this.openConnection(session.debugPort);
          return session;
        })
        .finally(() => {
          this.starting = null;
        });
    }

    return this.starting;
  }

  // Late-bound so the capture always targets the session's current CDP connection — which is rebuilt if
  // the window is relaunched (refreshActiveWindow) — rather than a socket captured at handler-wiring time.
  private capture(box: Box): Promise<string | null> {
    const connection = this.active?.connection ?? null;
    return connection === null ? Promise.resolve(null) : connection.capture(box);
  }

  private startSession(target: string): Promise<ActiveDesign> {
    const state = this.registry.open(target);
    return new Promise<ActiveDesign>((resolve, reject) => {
      const {close} = startProxyServer({
        target,
        sessionId: state.id,
        token: state.token,
        clientMode: 'design',
        handlers: makeDesignApiHandlers(this.registry, state.id, (box) => this.capture(box)),
        onListen: (origin) => {
          this.registry.setOrigin(state.id, origin, [origin]);
          const session: ActiveDesign = {
            id: state.id,
            reviewUrl: origin,
            // Placeholder until ensureSession launches the real window; reports alive so a caliper_design
            // call racing the in-flight launch never mistakes it for a closed window and relaunches.
            window: {close: () => undefined, debugPort: null, isAlive: () => true},
            close,
            debugPort: null,
            connection: null,
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

  private async settle(session: ActiveDesign, note?: string): Promise<DesignResult> {
    const state = await this.registry.wait(session.id, ASK_WINDOW_MS);
    const warning = this.injectionRisk
      ? "\nwarning: the app sent a Content-Security-Policy that may block Caliper's injected script " +
        `(${this.injectionRisk}). If the window looks empty, the design overlay could not load.`
      : '';

    if (state.submitted) {
      this.persistScreenshots(state);
      session.connection?.close();
      session.window.close();
      session.close();
      if (this.active?.id === session.id) this.active = null;
      // The review url is omitted on the final result — the window has already closed, so it is only
      // actionable on the PENDING responses that precede submission.
      return {
        completed: true,
        ticket: session.id,
        text: `${this.toon(state)}${warning}`,
      };
    }

    const noteLine = note ? `\n${note}` : '';
    return {
      completed: false,
      ticket: session.id,
      text:
        `${this.pending(state)}\n\nstatus: PENDING — the developer has not submitted yet. ` +
        `Call caliper_design again to keep waiting.\nreview url: ${session.reviewUrl}${warning}${noteLine}`,
    };
  }

  // A poll before submit returns only a counter — never the full snapshot. The marks and their styles
  // arrive once, in the final (submitted) result, instead of on every wait.
  private pending(state: DesignSessionState): string {
    const counts = new Map<string, number>();
    for (const annotation of state.annotations) {
      counts.set(annotation.severity, (counts.get(annotation.severity) ?? 0) + 1);
    }
    const severity = Array.from(counts, ([name, count]) => `${name}=${count}`).join(' ');
    const lines = ['design:', `  id: ${state.id.slice(0, 8)}`, `  count: ${state.annotations.length}`];
    if (severity) lines.push(`  severity: ${severity}`);
    return lines.join('\n');
  }

  // Writes each in-memory `data:` screenshot to <cwd>/.caliper/<sessionShort>/<annShort>.png and
  // swaps the annotation's screenshot for that relative path, so the toon carries a file the agent
  // can open instead of an inline base64 blob. Best-effort per mark: a write failure drops the path.
  private persistScreenshots(state: DesignSessionState): void {
    const sessionShort = state.id.slice(0, ID_SHORT);
    const dir = join(process.cwd(), '.caliper', sessionShort);
    for (const annotation of state.annotations) {
      const dataUrl = annotation.screenshot;
      if (dataUrl === undefined || !dataUrl.startsWith('data:')) continue;
      const relativePath = this.writeScreenshot(dir, sessionShort, annotation.id, dataUrl);
      if (relativePath === null) delete annotation.screenshot;
      else annotation.screenshot = relativePath;
    }
  }

  private writeScreenshot(dir: string, sessionShort: string, annotationId: string, dataUrl: string): string | null {
    const annShort = annotationId.slice(0, ID_SHORT);
    try {
      mkdirSync(dir, {recursive: true});
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      writeFileSync(join(dir, `${annShort}.png`), Buffer.from(base64, 'base64'));
      return `.caliper/${sessionShort}/${annShort}.png`;
    } catch {
      return null;
    }
  }

  private toon(state: DesignSessionState): string {
    const session: CaliperSession = {
      schemaVersion: 1,
      id: state.id,
      createdAt: state.createdAt,
      caliperVersion: CALIPER_VERSION,
      annotations: state.annotations,
      traces: [],
      assets: {},
    };
    return toToon(session);
  }
}
