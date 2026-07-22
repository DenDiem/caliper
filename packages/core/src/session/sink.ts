import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

export interface AnnotationSink {
  push(annotation: CaliperAnnotation, screenshot?: string): Promise<void>;
  read(): Promise<CaliperSession>;
  update(id: string, patch: Partial<CaliperAnnotation>): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
