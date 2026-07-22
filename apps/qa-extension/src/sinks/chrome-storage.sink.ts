import type {AnnotationSink, CaliperAnnotation, CaliperSession} from '@caliper/core';
import {caliperSessionSchema} from '@caliper/core';

const STORAGE_KEY = 'caliper.session';
const CALIPER_VERSION = '0.1.0';

const emptySession = (): CaliperSession => ({
  schemaVersion: 1,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  caliperVersion: CALIPER_VERSION,
  annotations: [],
  assets: {},
});

const readSession = async (): Promise<CaliperSession> => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const parsed = caliperSessionSchema.safeParse(stored[STORAGE_KEY]);
  return parsed.success ? parsed.data : emptySession();
};

const writeSession = async (session: CaliperSession): Promise<void> => {
  await chrome.storage.local.set({[STORAGE_KEY]: session});
};

export const chromeStorageSink: AnnotationSink = {
  async push(annotation: CaliperAnnotation, screenshot?: string) {
    const session = await readSession();
    const assets = {...session.assets};
    let stored = annotation;

    if (screenshot) {
      const screenshotId = crypto.randomUUID();
      assets[screenshotId] = screenshot;
      stored = {...annotation, screenshotId};
    }

    await writeSession({...session, annotations: [...session.annotations, stored], assets});
  },

  read: readSession,

  async update(id: string, patch: Partial<CaliperAnnotation>) {
    const session = await readSession();
    await writeSession({
      ...session,
      annotations: session.annotations.map((item) => (item.id === id ? {...item, ...patch} : item)),
    });
  },

  async remove(id: string) {
    const session = await readSession();
    const target = session.annotations.find((item) => item.id === id);
    const assets = {...session.assets};
    if (target?.screenshotId) delete assets[target.screenshotId];

    await writeSession({
      ...session,
      annotations: session.annotations.filter((item) => item.id !== id),
      assets,
    });
  },

  async clear() {
    await writeSession(emptySession());
  },
};
