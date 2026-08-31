import type {AnnotationSink, CaliperAnnotation, CaliperTrace} from '@caliper/core';
import type {StoreOp} from '../messaging/messages';
import {activeSession, readStore, type CaliperStore} from './store';

export type {CaliperStore};

// Mutations are funneled to the background's single serialized writer; reads stay local.
const dispatch = (op: StoreOp): Promise<void> =>
  chrome.runtime.sendMessage({type: 'caliper/store-op', op}).then(() => undefined);

// The manifest entry and the blobs live in different stores, so dropping a trace has to do both or the
// video and replay stay on disk with nothing pointing at them.
const dropBlobs = (traceIds: readonly string[]): Promise<void> =>
  chrome.runtime
    .sendMessage({type: 'caliper/trace-blobs-drop', traceIds})
    .then(() => undefined)
    .catch(() => undefined);

interface MultiSessionSink extends AnnotationSink {
  readStore: () => Promise<CaliperStore>;
  createSession: () => Promise<void>;
  activateSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  pushTrace: (trace: CaliperTrace) => Promise<void>;
  renameTrace: (id: string, label: string) => Promise<void>;
  removeTrace: (id: string) => Promise<void>;
}

export const chromeStorageSink: MultiSessionSink = {
  push: (annotation: CaliperAnnotation, screenshot?: string) => dispatch({kind: 'push', annotation, screenshot}),

  read: async () => activeSession(await readStore()),

  update: (id: string, patch: Partial<CaliperAnnotation>) => dispatch({kind: 'update', id, patch}),

  remove: (id: string) => dispatch({kind: 'removeAnnotation', id}),

  clear: async () => {
    const session = activeSession(await readStore());
    await dispatch({kind: 'clear'});
    await dropBlobs(session.traces.map((trace) => trace.id));
  },

  readStore,

  createSession: () => dispatch({kind: 'createSession'}),

  activateSession: (id: string) => dispatch({kind: 'activateSession', id}),

  removeSession: async (id: string) => {
    const store = await readStore();
    const removed = store.sessions.find((session) => session.id === id);
    await dispatch({kind: 'removeSession', id});
    await dropBlobs((removed?.traces ?? []).map((trace) => trace.id));
  },

  pushTrace: (trace: CaliperTrace) => dispatch({kind: 'pushTrace', trace}),

  renameTrace: (id: string, label: string) => dispatch({kind: 'renameTrace', id, label}),

  removeTrace: async (id: string) => {
    await dispatch({kind: 'removeTrace', id});
    await dropBlobs([id]);
  },
};
