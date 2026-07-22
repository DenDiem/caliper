import {z} from 'zod';

export const severitySchema = z.enum(['blocker', 'major', 'minor', 'nitpick']);
export const authorSchema = z.enum(['human', 'agent']);
export const verdictSchema = z.enum(['accepted', 'rejected', 'needs-work']);
export const selectorStrategySchema = z.enum(['testid', 'id', 'component-path', 'nth-path']);
export const selectorConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const componentSourceSchema = z.enum(['ng-devmode', 'tag-heuristic']).nullable();

export const styleValueSchema = z.object({
  value: z.string(),
  token: z.string().nullish(),
  tokenMatch: z.enum(['exact', 'nearest']).nullish(),
});

export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const elementContextSchema = z.object({
  selector: z.string(),
  selectorStrategy: selectorStrategySchema,
  selectorConfidence: selectorConfidenceSchema,
  tagName: z.string(),
  componentName: z.string().nullable(),
  componentSource: componentSourceSchema,
  componentChain: z.array(z.string()),
  text: z.string(),
  attributes: z.record(z.string()),
  box: boxSchema,
  styles: z.record(styleValueSchema),
});

export const caliperAnnotationSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  comment: z.string(),
  severity: severitySchema,
  author: authorSchema.default('human'),
  concernType: z.string().nullable().default(null),
  verdict: verdictSchema.nullable().default(null),
  figmaUrl: z.string().url().optional(),
  page: z.object({
    url: z.string(),
    title: z.string(),
    viewport: z.object({width: z.number(), height: z.number(), dpr: z.number()}),
  }),
  target: elementContextSchema,
  screenshotId: z.string().optional(),
});

export const caliperSessionSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string(),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  caliperVersion: z.string(),
  annotations: z.array(caliperAnnotationSchema),
  assets: z.record(z.string()),
});

export type Severity = z.infer<typeof severitySchema>;
export type Author = z.infer<typeof authorSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type SelectorStrategy = z.infer<typeof selectorStrategySchema>;
export type SelectorConfidence = z.infer<typeof selectorConfidenceSchema>;
export type ComponentSource = z.infer<typeof componentSourceSchema>;
export type StyleValue = z.infer<typeof styleValueSchema>;
export type Box = z.infer<typeof boxSchema>;
export type ElementContext = z.infer<typeof elementContextSchema>;
export type CaliperAnnotation = z.infer<typeof caliperAnnotationSchema>;
export type CaliperSession = z.infer<typeof caliperSessionSchema>;
