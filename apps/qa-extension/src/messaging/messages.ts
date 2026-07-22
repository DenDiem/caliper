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

export type CaliperMessage =
  | ToggleMessage
  | AnnotationCreatedMessage
  | CaptureMessage
  | ToggleTabMessage;

export const isCaliperMessage = (value: unknown): value is CaliperMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type: unknown = Reflect.get(value, 'type');
  return (
    type === 'caliper/toggle' ||
    type === 'caliper/annotation-created' ||
    type === 'caliper/capture' ||
    type === 'caliper/toggle-tab'
  );
};
