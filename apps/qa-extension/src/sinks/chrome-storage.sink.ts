import type {
  AnnotationSink,
  CaliperAnnotation,
  CaliperSession,
  SessionHistory,
  SessionTask,
} from '@caliper/core';
import {caliperSessionSchema, caliperSessionsSchema} from '@caliper/core';

const SESSIONS_KEY = 'caliper.sessions';
const ACTIVE_KEY = 'caliper.activeSessionId';
const LEGACY_KEY = 'caliper.session';
const CALIPER_VERSION = '0.1.0';

const emptySession = (task: SessionTask | null = null): CaliperSession => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  caliperVersion: CALIPER_VERSION,
  task,
  closedAt: null,
  annotations: [],
  assets: {},
});

const readStored = async (): Promise<{sessions: CaliperSession[]; activeId: string | null}> => {
  const stored = await chrome.storage.local.get([SESSIONS_KEY, ACTIVE_KEY, LEGACY_KEY]);

  const parsed = caliperSessionsSchema.safeParse(stored[SESSIONS_KEY]);
  if (parsed.success && parsed.data.length > 0) {
    const activeId: unknown = stored[ACTIVE_KEY];
    return {
      sessions: parsed.data,
      activeId: typeof activeId === 'string' ? activeId : null,
    };
  }

  const legacy = caliperSessionSchema.safeParse(stored[LEGACY_KEY]);
  return legacy.success ? {sessions: [legacy.data], activeId: legacy.data.id} : {sessions: [], activeId: null};
};

const writeStored = async (sessions: CaliperSession[], activeId: string): Promise<void> => {
  await chrome.storage.local.set({[SESSIONS_KEY]: sessions, [ACTIVE_KEY]: activeId});
  await chrome.storage.local.remove(LEGACY_KEY);
};

const withActive = async (): Promise<{sessions: CaliperSession[]; active: CaliperSession}> => {
  const {sessions, activeId} = await readStored();

  const existing = sessions.find((session) => session.id === activeId) ?? sessions[0];
  if (existing) return {sessions, active: existing};

  const created = emptySession();
  return {sessions: [created], active: created};
};

const save = async (sessions: CaliperSession[], active: CaliperSession): Promise<void> => {
  const merged = sessions.some((session) => session.id === active.id)
    ? sessions.map((session) => (session.id === active.id ? active : session))
    : [active, ...sessions];

  await writeStored(merged, active.id);
};

export const chromeStorageSink: AnnotationSink = {
  async push(annotation: CaliperAnnotation, screenshot?: string) {
    const {sessions, active} = await withActive();
    const assets = {...active.assets};
    let stored = annotation;

    if (screenshot) {
      const screenshotId = crypto.randomUUID();
      assets[screenshotId] = screenshot;
      stored = {...annotation, screenshotId};
    }

    await save(sessions, {...active, annotations: [...active.annotations, stored], assets});
  },

  async read() {
    const {active} = await withActive();
    return active;
  },

  async update(id: string, patch: Partial<CaliperAnnotation>) {
    const {sessions, active} = await withActive();
    await save(sessions, {
      ...active,
      annotations: active.annotations.map((item) => (item.id === id ? {...item, ...patch} : item)),
    });
  },

  async remove(id: string) {
    const {sessions, active} = await withActive();
    const target = active.annotations.find((item) => item.id === id);
    const assets = {...active.assets};
    if (target?.screenshotId) delete assets[target.screenshotId];

    await save(sessions, {
      ...active,
      annotations: active.annotations.filter((item) => item.id !== id),
      assets,
    });
  },

  async clear() {
    const {sessions, active} = await withActive();
    await save(sessions, {...active, annotations: [], assets: {}});
  },
};

export const chromeSessionHistory: SessionHistory = {
  async list() {
    const {sessions} = await readStored();
    return sessions;
  },

  async start(task: SessionTask | null) {
    const {sessions, active} = await withActive();
    const created = emptySession(task);
    const others = sessions.filter((session) => session.id !== active.id);

    // An untouched session is dropped rather than archived — otherwise every panel visit
    // leaves an empty entry in the history.
    const closed =
      active.annotations.length > 0 ? [{...active, closedAt: new Date().toISOString()}] : [];

    await writeStored([created, ...closed, ...others], created.id);

    return created;
  },

  async activate(sessionId: string) {
    const {sessions} = await readStored();
    if (!sessions.some((session) => session.id === sessionId)) return;
    await chrome.storage.local.set({[ACTIVE_KEY]: sessionId});
  },

  async setTask(task: SessionTask | null) {
    const {sessions, active} = await withActive();
    await save(sessions, {...active, task});
  },

  async drop(sessionId: string) {
    const {sessions, activeId} = await readStored();
    const remaining = sessions.filter((session) => session.id !== sessionId);

    if (remaining.length === 0) {
      const created = emptySession();
      await writeStored([created], created.id);
      return;
    }

    const nextActiveId = activeId === sessionId ? (remaining[0]?.id ?? '') : (activeId ?? '');
    await writeStored(remaining, nextActiveId);
  },
};
