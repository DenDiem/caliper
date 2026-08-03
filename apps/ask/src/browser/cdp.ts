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

const isCaptureResult = (value: unknown): value is CaptureResult =>
  isRecord(value) &&
  value.id === 1 &&
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

const captureOverSocket = (debuggerUrl: string, box: Box): Promise<string | null> =>
  new Promise((resolve) => {
    const socket = new WebSocket(debuggerUrl);
    let settled = false;

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // best-effort — the socket may already be closing
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), CDP_TIMEOUT_MS);

    socket.addEventListener('open', () => {
      const command = {
        id: 1,
        method: 'Page.captureScreenshot',
        params: {format: 'png', clip: clip(box), captureBeyondViewport: false},
      };
      try {
        socket.send(JSON.stringify(command));
      } catch {
        finish(null);
      }
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      const parsed = parseMessage(event.data);
      if (isCaptureResult(parsed)) finish(`data:image/png;base64,${parsed.result.data}`);
    });

    socket.addEventListener('error', () => finish(null));
    socket.addEventListener('close', () => finish(null));
  });

// Screenshots a viewport region of the design page over the Chrome DevTools Protocol. Best-effort:
// any failure (DevTools unreachable, no page target, socket error, malformed frame, 4s timeout)
// resolves null so the design flow proceeds exactly as it does today, just without a crop.
export const captureRegion = async (debugPort: number, box: Box): Promise<string | null> => {
  try {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!response.ok) return null;
    const targets: unknown = await response.json();
    const debuggerUrl = pageDebuggerUrl(targets);
    if (debuggerUrl === null) return null;
    return await captureOverSocket(debuggerUrl, box);
  } catch {
    return null;
  }
};
