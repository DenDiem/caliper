import type {Box, ElementContext} from '@caliper/core';

const scriptSrc = (): string =>
  document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href;

const scriptUrl = new URL(scriptSrc());
const queryToken = scriptUrl.searchParams.get('t');
const querySession = scriptUrl.searchParams.get('s');

// The proxy appends &mode=design for design sessions; absent for the default Q&A review flow.
export const mode = scriptUrl.searchParams.get('mode');

// Proxy mode: the proxy injected ?s=&t= into this very script tag, relative /__caliper__ paths work
// same-origin. Snippet mode: no query params (a static snippet can't carry a per-session token) — the
// API base is this script's own origin, and the token is fetched from /__caliper__/bootstrap first.
const isProxyMode = queryToken !== null && querySession !== null;
const base = isProxyMode ? '' : scriptUrl.origin;
const prefix = '/__caliper__';

let token = queryToken ?? '';

const endpoint = (path: string): string => `${base}${prefix}${path}`;
const authHeaders = (): Record<string, string> => ({'x-caliper-token': token, 'content-type': 'application/json'});

const assertOk = (response: Response): Response => {
  if (!response.ok) throw new Error(`Request to ${response.url} failed with status ${response.status}`);
  return response;
};

const unreachableError = (detail: string): Error =>
  new Error(`Caliper could not reach its server on the snippet port (${base}). ${detail}`);

interface BootstrapPayload {
  sessionId: string;
  token: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isBootstrapPayload = (value: unknown): value is BootstrapPayload =>
  isRecord(value) && typeof value.sessionId === 'string' && typeof value.token === 'string';

export const bootstrap = async (): Promise<void> => {
  if (isProxyMode) return;

  let response: Response;
  try {
    response = await fetch(endpoint('/bootstrap'));
  } catch {
    throw unreachableError(
      'Confirm the app was started with `CALIPER_MODE=snippet caliper` (or via the MCP server) on this port.',
    );
  }
  if (!response.ok) {
    throw unreachableError(`Bootstrap request failed with status ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isBootstrapPayload(payload)) {
    throw unreachableError('Bootstrap returned an unexpected response shape.');
  }
  token = payload.token;
};

export const fetchState = () =>
  fetch(`${endpoint('/state')}?t=${token}`, {headers: {'x-caliper-token': token}}).then((response) =>
    response.json(),
  );

export const postDraft = (ref: string, answer: string, verdict?: string) =>
  fetch(`${endpoint('/drafts')}?t=${token}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ref, answer, verdict}),
  }).then(assertOk);

export const postAnswers = (answers: {ref: string; answer: string; verdict?: string}[], final?: boolean) =>
  fetch(`${endpoint('/answers')}?t=${token}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({answers, final}),
  }).then(assertOk);

export const postResolve = (ref: string, target: ElementContext, route: string) =>
  fetch(`${endpoint('/resolve')}?t=${token}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ref, target, route}),
  }).then(assertOk);

export const events = () => new EventSource(`${endpoint('/events')}?t=${token}`);

export const postMark = (annotation: unknown) =>
  fetch(`${endpoint('/marks')}?t=${token}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(annotation),
  }).then(assertOk);

const isImageResponse = (value: unknown): value is {image: string | null} =>
  isRecord(value) && (typeof value.image === 'string' || value.image === null);

// Best-effort: the server crops the region over CDP and returns {image}. Any failure resolves null
// so marking proceeds without a screenshot.
export const postCapture = (box: Box): Promise<string | null> =>
  fetch(`${endpoint('/capture')}?t=${token}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(box),
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((json: unknown) => (isImageResponse(json) ? (json.image ?? null) : null))
    .catch(() => null);

export const postSubmit = () =>
  fetch(`${endpoint('/submit')}?t=${token}`, {method: 'POST', headers: authHeaders()}).then(assertOk);
