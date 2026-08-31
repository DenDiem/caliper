import type {CaliperSession} from '@caliper/core';
import {caliperSessionSchema} from '@caliper/core';
import type {StoreOp} from '../messaging/messages';

const STORE_KEY = 'caliper.store';
const LEGACY_KEY = 'caliper.session';
const CALIPER_VERSION = '0.1.0';

export interface CaliperStore {
  sessions: CaliperSession[];
  activeId: string;
}

const emptySession = (): CaliperSession => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  caliperVersion: CALIPER_VERSION,
  annotations: [],
  traces: [],
  assets: {},
});

const freshStore = (session: CaliperSession = emptySession()): CaliperStore => ({
  sessions: [session],
  activeId: session.id,
});

const isCaliperStore = (value: unknown): value is CaliperStore =>
  typeof value === 'object' &&
  value !== null &&
  'sessions' in value &&
  Array.isArray(value.sessions) &&
  'activeId' in value &&
  typeof value.activeId === 'string';

export const readStore = async (): Promise<CaliperStore> => {
  const raw = await chrome.storage.local.get([STORE_KEY, LEGACY_KEY]);
  const stored = raw[STORE_KEY];
  if (isCaliperStore(stored) && stored.sessions.length > 0) return stored;

  const legacy = caliperSessionSchema.safeParse(raw[LEGACY_KEY]);
  const store = freshStore(legacy.success ? legacy.data : emptySession());
  await chrome.storage.local.set({[STORE_KEY]: store});
  return store;
};

const writeStore = (store: CaliperStore): Promise<void> =>
  chrome.storage.local.set({[STORE_KEY]: store});

export const activeSession = (store: CaliperStore): CaliperSession =>
  store.sessions.find((session) => session.id === store.activeId) ?? store.sessions[0];

const mutateSession = (session: CaliperSession, op: StoreOp): CaliperSession => {
  switch (op.kind) {
    case 'push': {
      const assets = {...session.assets};
      let stored = op.annotation;
      if (op.screenshot) {
        const screenshotId = crypto.randomUUID();
        assets[screenshotId] = op.screenshot;
        stored = {...op.annotation, screenshotId};
      }
      return {...session, annotations: [...session.annotations, stored], assets};
    }
    case 'update':
      return {
        ...session,
        annotations: session.annotations.map((item) => (item.id === op.id ? {...item, ...op.patch} : item)),
      };
    case 'removeAnnotation': {
      const target = session.annotations.find((item) => item.id === op.id);
      const assets = {...session.assets};
      if (target?.screenshotId) delete assets[target.screenshotId];
      return {...session, annotations: session.annotations.filter((item) => item.id !== op.id), assets};
    }
    case 'clear':
      return {...session, annotations: [], traces: [], assets: {}};
    // A session that carries a trace is v2 by definition; the bump happens here rather than at creation
    // so a mark-only session keeps declaring v1 and stays readable by an older caliper pull.
    case 'pushTrace':
      return {...session, schemaVersion: 2, traces: [...session.traces, op.trace]};
    case 'removeTrace':
      return {...session, traces: session.traces.filter((item) => item.id !== op.id)};
    default:
      return session;
  }
};

const applyOp = async (op: StoreOp): Promise<void> => {
  const store = await readStore();

  if (op.kind === 'createSession') {
    const session = emptySession();
    await writeStore({sessions: [...store.sessions, session], activeId: session.id});
    return;
  }
  if (op.kind === 'activateSession') {
    if (store.sessions.some((session) => session.id === op.id)) {
      await writeStore({...store, activeId: op.id});
    }
    return;
  }
  if (op.kind === 'removeSession') {
    const sessions = store.sessions.filter((session) => session.id !== op.id);
    if (sessions.length === 0) {
      await writeStore(freshStore());
      return;
    }
    const activeId = store.activeId === op.id ? sessions[sessions.length - 1].id : store.activeId;
    await writeStore({sessions, activeId});
    return;
  }

  const current = activeSession(store);
  const next = mutateSession(current, op);
  await writeStore({
    ...store,
    sessions: store.sessions.map((session) => (session.id === current.id ? next : session)),
  });
};

// Single serialized writer: every mutation runs strictly after the previous one, so concurrent
// read-modify-write calls (rapid saves, or a page-side save racing a panel action) can't clobber
// each other. All contexts funnel their mutations here through the background.
let chain: Promise<void> = Promise.resolve();

export const runOp = (op: StoreOp): Promise<void> => {
  const run = chain.then(() => applyOp(op));
  chain = run.catch(() => undefined);
  return run;
};
