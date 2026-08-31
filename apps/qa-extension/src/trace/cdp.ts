import type {TraceConsoleEntry, TraceConsoleLevel, TraceNetworkEntry} from '@caliper/core';

const PROTOCOL_VERSION = '1.3';
const OK_FLOOR = 200;
const OK_CEILING = 300;
const BODY_LIMIT = 20_000;
const MAX_BODIES = 40;
// Half the rate and quality of the tabCapture path. This is the fallback a trace falls back *to*, and
// its job is to let a human recognise the moment, not to be a faithful recording.
const SCREENCAST = {format: 'jpeg', quality: 50, maxWidth: 1280, maxHeight: 800, everyNthFrame: 2};

export interface CdpCollector {
  readonly console: TraceConsoleEntry[];
  readonly network: TraceNetworkEntry[];
  // False once Chrome took the session away mid-trace — opening DevTools on the tab does exactly that,
  // and the design assumes QA keeps DevTools open. The arrays simply stop growing, so without this the
  // trace would be stamped `cdp` while missing everything after the detach.
  readonly attached: () => boolean;
  // Asked before the collected arrays are trusted. onDetach covers the detaches Chrome announces, but
  // not every way a session can die, so liveness is confirmed rather than assumed.
  readonly isLive: () => Promise<boolean>;
  // Video without activeTab. chrome.tabCapture needs the extension to have been invoked on the tab from
  // the toolbar, and Chrome revokes that on navigation — but the debugger is already attached for the
  // duration of the trace, and a screencast off that session needs no such grant.
  startScreencast: (onFrame: (dataUrl: string) => void) => Promise<boolean>;
  stopScreencast: () => Promise<void>;
  detach: () => Promise<void>;
}

interface PendingRequest {
  t: number;
  method: string;
  url: string;
  requestBody?: string;
  headers?: Record<string, string>;
}

const LEVEL_BY_CDP_TYPE: Record<string, TraceConsoleLevel> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

const stringHeaders = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).map(([name, header]) => [name, text(header)]),
  );

// Attaching fails when DevTools already owns the tab — the common case for a QA engineer, which is why
// a null return is a routine outcome the caller degrades from rather than an error it reports.
export const attachCdp = async (
  tabId: number,
  now: () => number,
): Promise<CdpCollector | null> => {
  const target: chrome.debugger.Debuggee = {tabId};
  try {
    await chrome.debugger.attach(target, PROTOCOL_VERSION);
  } catch {
    return null;
  }

  const consoleEntries: TraceConsoleEntry[] = [];
  const network: TraceNetworkEntry[] = [];
  const pending = new Map<string, PendingRequest>();
  const requestIdByEntry: string[] = [];

  const finish = (requestId: string, status: number, failed: boolean): void => {
    const start = pending.get(requestId);
    if (!start) return;
    pending.delete(requestId);
    network.push({
      t: start.t,
      method: start.method,
      url: start.url,
      status,
      durationMs: now() - start.t,
      failed,
      requestBody: start.requestBody,
      headers: start.headers,
    });
    requestIdByEntry.push(requestId);
  };

  let onScreencastFrame: ((dataUrl: string) => void) | null = null;
  let attached = true;

  const onDetach = (source: chrome.debugger.Debuggee): void => {
    if (source.tabId !== tabId) return;
    attached = false;
    onScreencastFrame = null;
  };

  const onEvent = (source: chrome.debugger.Debuggee, method: string, params?: object): void => {
    if (source.tabId !== tabId) return;
    const data = asRecord(params);

    if (method === 'Page.screencastFrame') {
      const sessionId = numberOf(data.sessionId);
      // Acknowledged first and unconditionally: Chrome stops sending frames until the previous one is
      // acked, so a throw on the consumer side would silently end the recording.
      void chrome.debugger
        .sendCommand(target, 'Page.screencastFrameAck', {sessionId})
        .catch(() => undefined);
      onScreencastFrame?.(`data:image/jpeg;base64,${text(data.data)}`);
      return;
    }

    if (method === 'Runtime.consoleAPICalled') {
      const args = Array.isArray(data.args) ? data.args : [];
      consoleEntries.push({
        t: now(),
        level: LEVEL_BY_CDP_TYPE[text(data.type)] ?? 'log',
        text: args
          .map((arg) => text(asRecord(arg).value) || text(asRecord(arg).description))
          .join(' '),
      });
      return;
    }

    if (method === 'Runtime.exceptionThrown') {
      const details = asRecord(data.exceptionDetails);
      const exception = asRecord(details.exception);
      consoleEntries.push({
        t: now(),
        level: 'error',
        text: text(exception.description) || text(details.text),
        stack: JSON.stringify(details.stackTrace ?? null),
      });
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      const request = asRecord(data.request);
      pending.set(text(data.requestId), {
        t: now(),
        method: text(request.method) || 'GET',
        url: text(request.url),
        requestBody: typeof request.postData === 'string' ? request.postData : undefined,
        headers: stringHeaders(request.headers),
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const status = numberOf(asRecord(data.response).status);
      finish(text(data.requestId), status, status < OK_FLOOR || status >= OK_CEILING);
      return;
    }

    if (method === 'Network.loadingFinished') {
      void collectBody(text(data.requestId));
      return;
    }

    if (method === 'Network.loadingFailed') {
      finish(text(data.requestId), 0, true);
    }
  };

  chrome.debugger.onEvent.addListener(onEvent);
  chrome.debugger.onDetach.addListener(onDetach);
  try {
    await chrome.debugger.sendCommand(target, 'Runtime.enable');
    await chrome.debugger.sendCommand(target, 'Network.enable');
  } catch {
    // Attaching succeeded but the domains did not (the tab navigated, or the target went away). Leaving
    // the session attached would keep Chrome's debugging banner up for a trace that is not collecting.
    chrome.debugger.onEvent.removeListener(onEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    await chrome.debugger.detach(target).catch(() => undefined);
    return null;
  }

  // Bodies are read as each response finishes, not swept at Stop: Chrome discards them on navigation, so
  // a reproduction that crosses a page load would otherwise lose exactly the bodies that explain it.
  // Bounded so a chatty page cannot turn this into a second download of the whole session.
  let bodiesCollected = 0;
  const collectBody = async (requestId: string): Promise<void> => {
    if (bodiesCollected >= MAX_BODIES) return;

    const index = requestIdByEntry.indexOf(requestId);
    const entry = index === -1 ? undefined : network[index];
    if (!entry || entry.responseBody !== undefined) return;

    try {
      const result: unknown = await chrome.debugger.sendCommand(target, 'Network.getResponseBody', {
        requestId,
      });
      const body = text(asRecord(result).body);
      if (!body) return;
      entry.responseBody = body.slice(0, BODY_LIMIT);
      bodiesCollected += 1;
    } catch {
      // Already evicted, or a response with no body of its own; the entry keeps its status and timing.
    }
  };

  const stopScreencast = async (): Promise<void> => {
    if (!onScreencastFrame) return;
    onScreencastFrame = null;
    await chrome.debugger.sendCommand(target, 'Page.stopScreencast').catch(() => undefined);
  };

  return {
    console: consoleEntries,
    network,
    attached: () => attached,
    isLive: async () => {
      if (!attached) return false;
      try {
        await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {expression: '0'});
        return true;
      } catch {
        attached = false;
        return false;
      }
    },
    startScreencast: async (onFrame) => {
      try {
        await chrome.debugger.sendCommand(target, 'Page.enable');
        await chrome.debugger.sendCommand(target, 'Page.startScreencast', SCREENCAST);
        onScreencastFrame = onFrame;
        return true;
      } catch {
        return false;
      }
    },
    stopScreencast,
    detach: async () => {
      if (attached) await stopScreencast();
      chrome.debugger.onEvent.removeListener(onEvent);
      chrome.debugger.onDetach.removeListener(onDetach);
      if (attached) await chrome.debugger.detach(target).catch(() => undefined);
    },
  };
};
