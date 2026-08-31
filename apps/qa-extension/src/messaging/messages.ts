import type {
  Box,
  CaliperAnnotation,
  CaliperTrace,
  TraceConsoleEntry,
  TraceNetworkEntry,
  TraceStateEntry,
  TraceStep,
} from '@caliper/core';

// Mount the overlay in its persisted mode (Browse by default). Sent when the panel (re)opens.
export interface EngageMessage {
  type: 'caliper/engage';
}

// ⌥⇧C: flip Mark ⇄ Browse (mounting if needed), never unmount.
export interface ToggleModeMessage {
  type: 'caliper/toggle-mode';
}

export interface AnnotationCreatedMessage {
  type: 'caliper/annotation-created';
  annotation: CaliperAnnotation;
  screenshot?: string;
}

export interface CaptureMessage {
  type: 'caliper/capture';
  box: Box;
  dpr: number;
}

export interface DisarmMessage {
  type: 'caliper/disarm';
}

export interface DisarmTabMessage {
  type: 'caliper/disarm-tab';
  tabId: number;
}

// Set the overlay's mode (armed = Mark, else Browse) and ensure it is mounted. `set-mode` reaches the
// content script; `set-mode-tab` is the sidepanel's request the background forwards to the tab.
export interface SetModeMessage {
  type: 'caliper/set-mode';
  armed: boolean;
}

export interface SetModeTabMessage {
  type: 'caliper/set-mode-tab';
  tabId: number;
  armed: boolean;
}

export interface TraceBatch {
  // Set once any of the collector's ring buffers has discarded an event.
  dropped?: boolean;
  // A snapshot-only batch carries the store and nothing else; it is posted separately so that a store
  // which cannot be structured-cloned never costs the event channels.
  snapshotOnly?: boolean;
  // Absent on a snapshot-only batch, which is why every reader defaults them.
  steps?: TraceStep[];
  console?: TraceConsoleEntry[];
  network?: TraceNetworkEntry[];
  state?: TraceStateEntry[];
  replay?: string[];
  stateSnapshot?: unknown;
}

// The collector ships accumulated events on an interval rather than per event: a chatty page would
// otherwise cross the page-to-extension boundary thousands of times in a single trace.
export interface TraceBatchMessage {
  type: 'caliper/trace-batch';
  batch: TraceBatch;
}

export interface TraceStartMessage {
  type: 'caliper/trace-start';
  tabId: number;
  label: string;
}

export interface TraceStopMessage {
  type: 'caliper/trace-stop';
}

export interface TraceStatusMessage {
  type: 'caliper/trace-status';
  recording: boolean;
  startedAt: string | null;
  consoleErrors: number;
  failedRequests: number;
}

// Asked by the page bridge as soon as it loads. A navigation replaces the document mid-trace, so the
// fresh bridge has to learn that recording is still in progress instead of waiting for a Start it
// already missed.
export interface TraceActiveQueryMessage {
  type: 'caliper/trace-active';
}

// Blob cleanup runs in the background because IndexedDB here belongs to the extension origin and the
// store op alone only drops the manifest entry — the megabytes would otherwise stay forever.
export interface TraceBlobsDropMessage {
  type: 'caliper/trace-blobs-drop';
  traceIds: string[];
}

export interface CollectorControlMessage {
  type: 'caliper/collector-start' | 'caliper/collector-stop';
  // Milliseconds already elapsed in the trace when this document started collecting. A navigation
  // replaces the collector mid-trace, and without this its clock would restart at zero while the CDP
  // channels keep counting — interleaving a late click in front of the events that caused it.
  elapsedMs?: number;
}

export type StoreOp =
  | {kind: 'push'; annotation: CaliperAnnotation; screenshot?: string}
  | {kind: 'update'; id: string; patch: Partial<CaliperAnnotation>}
  | {kind: 'removeAnnotation'; id: string}
  | {kind: 'clear'}
  | {kind: 'createSession'}
  | {kind: 'activateSession'; id: string}
  | {kind: 'removeSession'; id: string}
  | {kind: 'pushTrace'; trace: CaliperTrace}
  | {kind: 'renameTrace'; id: string; label: string}
  | {kind: 'removeTrace'; id: string};

export interface StoreOpMessage {
  type: 'caliper/store-op';
  op: StoreOp;
}

export type CaliperMessage =
  | EngageMessage
  | ToggleModeMessage
  | AnnotationCreatedMessage
  | CaptureMessage
  | DisarmMessage
  | DisarmTabMessage
  | SetModeMessage
  | SetModeTabMessage
  | StoreOpMessage
  | TraceBatchMessage
  | TraceStartMessage
  | TraceStopMessage
  | TraceStatusMessage
  | TraceActiveQueryMessage
  | TraceBlobsDropMessage
  | CollectorControlMessage;

export const isCaliperMessage = (value: unknown): value is CaliperMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type: unknown = Reflect.get(value, 'type');
  return (
    type === 'caliper/engage' ||
    type === 'caliper/toggle-mode' ||
    type === 'caliper/annotation-created' ||
    type === 'caliper/capture' ||
    type === 'caliper/disarm' ||
    type === 'caliper/disarm-tab' ||
    type === 'caliper/set-mode' ||
    type === 'caliper/set-mode-tab' ||
    type === 'caliper/store-op' ||
    type === 'caliper/trace-batch' ||
    type === 'caliper/trace-start' ||
    type === 'caliper/trace-stop' ||
    type === 'caliper/trace-status' ||
    type === 'caliper/trace-active' ||
    type === 'caliper/trace-blobs-drop' ||
    type === 'caliper/collector-start' ||
    type === 'caliper/collector-stop'
  );
};
