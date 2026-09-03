const KEY = 'caliper.traceOptions';

export type VideoFormat = 'mp4' | 'webm';

export interface TraceOptions {
  redactSecrets: boolean;
  maxDurationMs: number;
  videoBitrate: number;
  videoFormat: VideoFormat;
  enableCdp: boolean;
}

// Redaction stays off unless the team turns it on — a recorded trace is deliberately complete by
// default. Every other default encodes the ~1 MB per 30 s video budget.
//
// MP4 is the default because the video exists to be watched by whoever opens the ticket: Jira plays
// it inline, while a VP9 WebM shows a download link there and in most chat clients. WebM stays
// available for anyone who wants the smaller file, and is used anyway when a browser cannot encode
// MP4 -- the container is decided by what MediaRecorder accepts, never by this preference alone.
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  redactSecrets: false,
  maxDurationMs: 120_000,
  videoBitrate: 250_000,
  videoFormat: 'mp4',
  enableCdp: true,
};

export const readTraceOptions = async (): Promise<TraceOptions> => {
  const raw: unknown = (await chrome.storage.local.get(KEY))[KEY];
  if (typeof raw !== 'object' || raw === null) return DEFAULT_TRACE_OPTIONS;
  return {...DEFAULT_TRACE_OPTIONS, ...raw};
};

export const writeTraceOptions = (options: TraceOptions): Promise<void> =>
  chrome.storage.local.set({[KEY]: options});
