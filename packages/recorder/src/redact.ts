import type {TraceNetworkEntry} from '@caliper/core';

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
    headers: entry.headers ? maskHeaders(entry.headers) : entry.headers,
    requestBody: entry.requestBody ? maskBody(entry.requestBody) : entry.requestBody,
    responseBody: entry.responseBody ? maskBody(entry.responseBody) : entry.responseBody,
  };
};
