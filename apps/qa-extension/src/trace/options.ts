const KEY = 'caliper.traceOptions';

export interface TraceOptions {
  redactSecrets: boolean;
  maxDurationMs: number;
  videoBitrate: number;
  enableCdp: boolean;
}

// Redaction stays off unless the team turns it on — a recorded trace is deliberately complete by
// default. Every other default encodes the ~1 MB per 30 s video budget.
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  redactSecrets: false,
  maxDurationMs: 120_000,
  videoBitrate: 250_000,
  enableCdp: true,
};

export const readTraceOptions = async (): Promise<TraceOptions> => {
  const raw: unknown = (await chrome.storage.local.get(KEY))[KEY];
  if (typeof raw !== 'object' || raw === null) return DEFAULT_TRACE_OPTIONS;
  return {...DEFAULT_TRACE_OPTIONS, ...raw};
};

export const writeTraceOptions = (options: TraceOptions): Promise<void> =>
  chrome.storage.local.set({[KEY]: options});
