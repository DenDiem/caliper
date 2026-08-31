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

    if (method === 'Network.loadingFailed') {
      finish(text(data.requestId), 0, true);
    }
  };

  chrome.debugger.onEvent.addListener(onEvent);
  await chrome.debugger.sendCommand(target, 'Runtime.enable');
  await chrome.debugger.sendCommand(target, 'Network.enable');

  // Bodies are collected once, at Stop, and only for the entries most likely to explain a defect.
  // Streaming every body during the trace would compete with the app being tested.
  const collectBodies = async (): Promise<void> => {
    const wanted = network
      .map((entry, index) => ({entry, requestId: requestIdByEntry[index]}))
      .filter((item) => item.requestId !== undefined)
      .sort((left, right) => Number(right.entry.failed) - Number(left.entry.failed))
      .slice(0, MAX_BODIES);

    for (const item of wanted) {
      try {
        const result: unknown = await chrome.debugger.sendCommand(
          target,
          'Network.getResponseBody',
          {requestId: item.requestId},
        );
        const body = text(asRecord(result).body);
        if (body) item.entry.responseBody = body.slice(0, BODY_LIMIT);
      } catch {
        // A body evicted from the CDP buffer is simply absent; the entry keeps its status and timing.
      }
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
      await stopScreencast();
      await collectBodies();
      chrome.debugger.onEvent.removeListener(onEvent);
      await chrome.debugger.detach(target).catch(() => undefined);
    },
  };
};
