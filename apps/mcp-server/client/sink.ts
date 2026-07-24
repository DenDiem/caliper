import type {ElementContext} from '@caliper/core';

const params = new URLSearchParams(
  new URL(document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href).search,
);
export const TOKEN = params.get('t') ?? '';
export const SESSION = params.get('s') ?? '';

const prefix = '/__caliper__';
const auth = {'x-caliper-token': TOKEN, 'content-type': 'application/json'};

export const fetchState = () =>
  fetch(`${prefix}/state?t=${TOKEN}`, {headers: {'x-caliper-token': TOKEN}}).then((response) => response.json());

const assertOk = (response: Response): Response => {
  if (!response.ok) throw new Error(`Request to ${response.url} failed with status ${response.status}`);
  return response;
};

export const postDraft = (ref: string, answer: string, verdict?: string) =>
  fetch(`${prefix}/drafts?t=${TOKEN}`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ref, answer, verdict}),
  }).then(assertOk);

export const postAnswers = (answers: {ref: string; answer: string; verdict?: string}[]) =>
  fetch(`${prefix}/answers?t=${TOKEN}`, {method: 'POST', headers: auth, body: JSON.stringify({answers})}).then(
    assertOk,
  );

export const postResolve = (ref: string, target: ElementContext) =>
  fetch(`${prefix}/resolve?t=${TOKEN}`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ref, target}),
  }).then(assertOk);

export const events = () => new EventSource(`${prefix}/events?t=${TOKEN}`);
