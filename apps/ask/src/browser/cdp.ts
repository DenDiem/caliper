import type {Box} from '@caliper/core';

const CDP_TIMEOUT_MS = 4000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

interface CdpTarget {
  type: string;
  webSocketDebuggerUrl: string;
}

const isCdpTarget = (value: unknown): value is CdpTarget =>
  isRecord(value) && typeof value.type === 'string' && typeof value.webSocketDebuggerUrl === 'string';

const pageDebuggerUrl = (targets: unknown): string | null => {
  if (!Array.isArray(targets)) return null;
  for (const target of targets) {
    if (isCdpTarget(target) && target.type === 'page') return target.webSocketDebuggerUrl;
  }
  return null;
};

interface CaptureResult {
  id: number;
  result: {data: string};
}

// One captureScreenshot reply, matched back to its command by id (many captures share one socket).
const isCaptureResult = (value: unknown): value is CaptureResult =>
  isRecord(value) &&
  typeof value.id === 'number' &&
  isRecord(value.result) &&
  typeof value.result.data === 'string';

const parseMessage = (data: unknown): unknown => {
  if (typeof data !== 'string') return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const clip = (box: Box): {x: number; y: number; width: number; height: number; scale: number} => ({
  x: Math.max(0, box.x),
  y: Math.max(0, box.y),
  width: Math.max(1, box.width),
  height: Math.max(1, box.height),
  scale: 1,
});

// captureBeyondViewport:false with the default fromSurface:true is deliberate: Chrome then crops the
// already-composited surface and never enters the Emulation / device-metrics path that resizes the
// visual viewport for a capture. Flipping either flag risks a visible viewport flash in the headful
// window (see the "marked element jumps to the corner" investigation) — keep them as-is.
const captureCommand = (id: number, box: Box): string =>
  JSON.stringify({
    id,
    method: 'Page.captureScreenshot',
    params: {format: 'png', clip: clip(box), captureBeyondViewport: false},
  });

// Opens the DevTools page socket and resolves once it is ready to take commands. Best-effort: a socket
// error, an early close, or a 4s handshake timeout resolves null so the caller degrades to no capture.
const openSocket = (debuggerUrl: string): Promise<WebSocket | null> =>
  new Promise((resolve) => {
    const socket = new WebSocket(debuggerUrl);
    let settled = false;

    const finish = (value: WebSocket | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (value === null) {
        try {
          socket.close();
        } catch {
          // best-effort — the socket may already be closing
        }
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), CDP_TIMEOUT_MS);
    socket.addEventListener('open', () => finish(socket));
    socket.addEventListener('error', () => finish(null));
    socket.addEventListener('close', () => finish(null));
  });

export interface CdpConnection {
  // Screenshots a viewport region of the design page over the already-open socket. Best-effort: a
  // dead socket, a send failure, a malformed frame, or a 4s timeout resolves null (no crop).
  capture(box: Box): Promise<string | null>;
  close(): void;
}

// A design-session-scoped CDP connection: resolve the page target and open the socket once, then reuse
// it for every capture. This keeps the overlay hidden only for the ~50-100ms a single captureScreenshot
// command takes, instead of the ~0.5-1s a fresh /json/list + socket handshake cost on every mark.
// Best-effort throughout: any failure to connect resolves null and the design flow proceeds without
// screenshots, exactly as it does when DevTools is unreachable.
export const createCdpConnection = async (debugPort: number): Promise<CdpConnection | null> => {
  let debuggerUrl: string | null;
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const targets: unknown = await response.json();
    debuggerUrl = pageDebuggerUrl(targets);
  } catch {
    return null;
  }
  if (debuggerUrl === null) return null;

  const socket = await openSocket(debuggerUrl);
  if (socket === null) return null;

  const pending = new Map<number, (value: string | null) => void>();
  let nextId = 1;
  let alive = true;

  const failAll = (): void => {
    alive = false;
    const finishers = Array.from(pending.values());
    pending.clear();
    for (const finish of finishers) finish(null);
  };

  socket.addEventListener('message', (event: MessageEvent) => {
    const parsed = parseMessage(event.data);
    if (isCaptureResult(parsed)) pending.get(parsed.id)?.(`data:image/png;base64,${parsed.result.data}`);
  });
  socket.addEventListener('close', failAll);
  socket.addEventListener('error', failAll);

  const capture = (box: Box): Promise<string | null> =>
    new Promise((resolve) => {
      if (!alive) {
        resolve(null);
        return;
      }
      const id = nextId;
      nextId += 1;
      let done = false;
      const finish = (value: string | null): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        pending.delete(id);
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), CDP_TIMEOUT_MS);
      pending.set(id, finish);
      try {
        socket.send(captureCommand(id, box));
      } catch {
        finish(null);
      }
    });

  const close = (): void => {
    failAll();
    try {
      socket.close();
    } catch {
      // best-effort — the socket may already be closing
    }
  };

  return {capture, close};
};
