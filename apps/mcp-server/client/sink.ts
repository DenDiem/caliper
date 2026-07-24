const params = new URLSearchParams(
  new URL(document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href).search,
);
export const TOKEN = params.get('t') ?? '';
export const SESSION = params.get('s') ?? '';

const prefix = '/__caliper__';
const auth = {'x-caliper-token': TOKEN, 'content-type': 'application/json'};

export const fetchState = () =>
  fetch(`${prefix}/state?t=${TOKEN}`, {headers: {'x-caliper-token': TOKEN}}).then((response) => response.json());

export const postDraft = (ref: string, answer: string, verdict?: string) =>
  fetch(`${prefix}/drafts?t=${TOKEN}`, {method: 'POST', headers: auth, body: JSON.stringify({ref, answer, verdict})});

export const postAnswers = (answers: {ref: string; answer: string; verdict?: string}[]) =>
  fetch(`${prefix}/answers?t=${TOKEN}`, {method: 'POST', headers: auth, body: JSON.stringify({answers})});

export const events = () => new EventSource(`${prefix}/events?t=${TOKEN}`);
