import type {TraceConsoleEntry, TraceNetworkEntry, TraceStateEntry} from '@caliper/core';

const SECRET_HEADER = /^(authorization|cookie|set-cookie|x-api-key)$/i;
const SECRET_FIELD = /(password|token|secret|authorization|api[-_]?key)/i;
const MASK = '[redacted]';

const maskHeaders = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, SECRET_HEADER.test(name) ? MASK : value]),
  );

const maskValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SECRET_FIELD.test(key) ? MASK : maskValue(nested),
    ]),
  );
};

// A token in a query string is as exposed as one in a header, and this is where OAuth flows put it.
const maskUrl = (url: string): string => {
  if (!url.includes('?')) return url;
  const [base, query] = url.split('?', 2);
  const masked = (query ?? '')
    .split('&')
    .map((pair) => {
      const [name] = pair.split('=', 1);
      return name && SECRET_FIELD.test(name) ? `${name}=${MASK}` : pair;
    })
    .join('&');
  return `${base}?${masked}`;
};

const maskBody = (body: string): string => {
  try {
    return JSON.stringify(maskValue(JSON.parse(body)));
  } catch {
    // A form-encoded or binary body has no field structure to walk; masking it blindly would destroy
    // the very payload the developer needs, so it is left exactly as recorded.
    return body;
  }
};

// Off by default. The product decision is that an internal staging trace is more useful complete than
// sanitised; this exists so a team filing to a tracker other people read can opt in.
export const redactNetworkEntry = (
  entry: TraceNetworkEntry,
  enabled: boolean,
): TraceNetworkEntry => {
  if (!enabled) return entry;
  return {
    ...entry,
    url: maskUrl(entry.url),
    headers: entry.headers ? maskHeaders(entry.headers) : entry.headers,
    requestBody: entry.requestBody ? maskBody(entry.requestBody) : entry.requestBody,
    responseBody: entry.responseBody ? maskBody(entry.responseBody) : entry.responseBody,
  };
};

// The store is where a single-page app keeps the session it was handed, so masking headers while
// shipping the whole state verbatim protected the least-exposed surface and left the worst one open.
export const redactStateEntry = (entry: TraceStateEntry, enabled: boolean): TraceStateEntry => {
  if (!enabled || entry.diff === undefined || entry.diff === null) return entry;
  return {...entry, diff: maskValue(entry.diff)};
};

export const redactSnapshot = (snapshot: unknown, enabled: boolean): unknown =>
  enabled ? maskValue(snapshot) : snapshot;

// Console text is free-form, so this is a blunt sweep for the shapes tokens actually take rather than
// a structural walk: a bearer token, and any `key=value` whose name looks like a secret.
const CONSOLE_SECRET = /\b(bearer\s+[\w.\-]+|(?:password|token|secret|api[-_]?key)["'\s:=]+[\w.\-]+)/gi;

export const redactConsoleEntry = (
  entry: TraceConsoleEntry,
  enabled: boolean,
): TraceConsoleEntry => {
  if (!enabled) return entry;
  return {...entry, text: entry.text.replace(CONSOLE_SECRET, MASK)};
};
