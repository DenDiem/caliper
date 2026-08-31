import type {AnnotationSink, CaliperAnnotation, CaliperTrace} from '@caliper/core';
import type {StoreOp} from '../messaging/messages';
import {activeSession, readStore, type CaliperStore} from './store';

export type {CaliperStore};

// Mutations are funneled to the background's single serialized writer; reads stay local.
const dispatch = (op: StoreOp): Promise<void> =>
  chrome.runtime.sendMessage({type: 'caliper/store-op', op}).then(() => undefined);

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

  clear: () => dispatch({kind: 'clear'}),

  readStore,

  createSession: () => dispatch({kind: 'createSession'}),

  activateSession: (id: string) => dispatch({kind: 'activateSession', id}),

  removeSession: (id: string) => dispatch({kind: 'removeSession', id}),

  pushTrace: (trace: CaliperTrace) => dispatch({kind: 'pushTrace', trace}),

  renameTrace: (id: string, label: string) => dispatch({kind: 'renameTrace', id, label}),

  removeTrace: (id: string) => dispatch({kind: 'removeTrace', id}),
};
