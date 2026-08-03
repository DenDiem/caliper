import type {Box, CaliperAnnotation} from '@caliper/core';

export interface ToggleMessage {
  type: 'caliper/toggle';
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

export interface ToggleTabMessage {
  type: 'caliper/toggle-tab';
  tabId: number;
}

export interface DisarmMessage {
  type: 'caliper/disarm';
}

export interface DisarmTabMessage {
  type: 'caliper/disarm-tab';
  tabId: number;
}

// Flip a mounted overlay's picker mode (armed = arm-picker, else passive). `set-mode` reaches the
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

export type StoreOp =
  | {kind: 'push'; annotation: CaliperAnnotation; screenshot?: string}
  | {kind: 'update'; id: string; patch: Partial<CaliperAnnotation>}
  | {kind: 'removeAnnotation'; id: string}
  | {kind: 'clear'}
  | {kind: 'createSession'}
  | {kind: 'activateSession'; id: string}
  | {kind: 'removeSession'; id: string};

export interface StoreOpMessage {
  type: 'caliper/store-op';
  op: StoreOp;
}

export type CaliperMessage =
  | ToggleMessage
  | AnnotationCreatedMessage
  | CaptureMessage
  | ToggleTabMessage
  | DisarmMessage
  | DisarmTabMessage
  | SetModeMessage
  | SetModeTabMessage
  | StoreOpMessage;

export const isCaliperMessage = (value: unknown): value is CaliperMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type: unknown = Reflect.get(value, 'type');
  return (
    type === 'caliper/toggle' ||
    type === 'caliper/annotation-created' ||
    type === 'caliper/capture' ||
    type === 'caliper/toggle-tab' ||
    type === 'caliper/disarm' ||
    type === 'caliper/disarm-tab' ||
    type === 'caliper/set-mode' ||
    type === 'caliper/set-mode-tab' ||
    type === 'caliper/store-op'
  );
};
