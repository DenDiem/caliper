import type {AnnotationSink, CaliperAnnotation, CaliperSession} from '@caliper/core';
import {caliperSessionSchema} from '@caliper/core';

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
  assets: {},
});

const freshStore = (session: CaliperSession = emptySession()): CaliperStore => ({
  sessions: [session],
  activeId: session.id,
});

const readStore = async (): Promise<CaliperStore> => {
  const raw = await chrome.storage.local.get([STORE_KEY, LEGACY_KEY]);
  const stored: CaliperStore | undefined = raw[STORE_KEY];
  if (stored && Array.isArray(stored.sessions) && stored.sessions.length > 0) return stored;

  const legacy = caliperSessionSchema.safeParse(raw[LEGACY_KEY]);
  const store = freshStore(legacy.success ? legacy.data : emptySession());
  await chrome.storage.local.set({[STORE_KEY]: store});
  return store;
};

const writeStore = (store: CaliperStore): Promise<void> =>
  chrome.storage.local.set({[STORE_KEY]: store});

const activeSession = (store: CaliperStore): CaliperSession =>
  store.sessions.find((session) => session.id === store.activeId) ?? store.sessions[0];

const mutateActive = async (change: (session: CaliperSession) => CaliperSession): Promise<void> => {
  const store = await readStore();
  const current = activeSession(store);
  const next = change(current);
  await writeStore({
    ...store,
    sessions: store.sessions.map((session) => (session.id === current.id ? next : session)),
  });
};

interface MultiSessionSink extends AnnotationSink {
  readStore: () => Promise<CaliperStore>;
  createSession: () => Promise<void>;
  activateSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
}

export const chromeStorageSink: MultiSessionSink = {
  async push(annotation: CaliperAnnotation, screenshot?: string) {
    await mutateActive((session) => {
      const assets = {...session.assets};
      let stored = annotation;
      if (screenshot) {
        const screenshotId = crypto.randomUUID();
        assets[screenshotId] = screenshot;
        stored = {...annotation, screenshotId};
      }
      return {...session, annotations: [...session.annotations, stored], assets};
    });
  },

  async read() {
    return activeSession(await readStore());
  },

  async update(id: string, patch: Partial<CaliperAnnotation>) {
    await mutateActive((session) => ({
      ...session,
      annotations: session.annotations.map((item) => (item.id === id ? {...item, ...patch} : item)),
    }));
  },

  async remove(id: string) {
    await mutateActive((session) => {
      const target = session.annotations.find((item) => item.id === id);
      const assets = {...session.assets};
      if (target?.screenshotId) delete assets[target.screenshotId];
      return {
        ...session,
        annotations: session.annotations.filter((item) => item.id !== id),
        assets,
      };
    });
  },

  async clear() {
    await mutateActive((session) => ({...session, annotations: [], assets: {}}));
  },

  readStore,

  async createSession() {
    const store = await readStore();
    const session = emptySession();
    await writeStore({sessions: [...store.sessions, session], activeId: session.id});
  },

  async activateSession(id: string) {
    const store = await readStore();
    if (store.sessions.some((session) => session.id === id)) {
      await writeStore({...store, activeId: id});
    }
  },

  async removeSession(id: string) {
    const store = await readStore();
    const sessions = store.sessions.filter((session) => session.id !== id);
    if (sessions.length === 0) {
      await writeStore(freshStore());
      return;
    }
    const activeId = store.activeId === id ? sessions[sessions.length - 1].id : store.activeId;
    await writeStore({sessions, activeId});
  },
};
