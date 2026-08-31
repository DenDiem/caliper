import type {TraceNetworkEntry} from '@caliper/core';

export interface FetchHost {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const OK_FLOOR = 200;
const OK_CEILING = 300;
const NETWORK_ERROR_STATUS = 0;

const urlOf = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const methodOf = (input: string | URL | Request, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== 'string' && !(input instanceof URL)) return input.method.toUpperCase();
  return 'GET';
};

// The fallback collector: it runs on every page but only reaches the trace when chrome.debugger could
// not attach. It deliberately does not read response bodies — cloning every response to buffer it would
// change the memory profile of the page under test, for a channel CDP normally supplies in full.
export const patchFetch = (
  target: FetchHost,
  sink: (entry: TraceNetworkEntry) => void,
  now: () => number,
): (() => void) => {
  const original = target.fetch;

  target.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const started = now();
    try {
      const response = await original.call(target, input, init);
      sink({
        t: started,
        method: methodOf(input, init),
        url: urlOf(input),
        status: response.status,
        durationMs: now() - started,
        failed: response.status < OK_FLOOR || response.status >= OK_CEILING,
      });
      return response;
    } catch (error) {
      sink({
        t: started,
        method: methodOf(input, init),
        url: urlOf(input),
        status: NETWORK_ERROR_STATUS,
        durationMs: now() - started,
        failed: true,
      });
      throw error;
    }
  };

  return () => {
    target.fetch = original;
  };
};
