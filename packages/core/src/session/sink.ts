import type {CaliperAnnotation, CaliperSession, SessionTask} from '../schema/annotation.schema';

export interface AnnotationSink {
  push(annotation: CaliperAnnotation, screenshot?: string): Promise<void>;
  read(): Promise<CaliperSession>;
  update(id: string, patch: Partial<CaliperAnnotation>): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionHistory {
  list(): Promise<CaliperSession[]>;
  start(task: SessionTask | null): Promise<CaliperSession>;
  activate(sessionId: string): Promise<void>;
  setTask(task: SessionTask | null): Promise<void>;
  drop(sessionId: string): Promise<void>;
}
