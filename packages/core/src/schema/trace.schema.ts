import {z} from 'zod';
import {pageSchema} from './page.schema';

// Which collector produced a channel. `fallback` means the in-page monkey-patches ran because
// chrome.debugger could not attach — bodies may be missing, and the agent is told so rather than
// silently reading a partial log as complete.
export const traceSourceSchema = z.enum(['cdp', 'fallback']);
export const traceStateSourceSchema = z.enum(['devtools-bridge', 'none']);
export const traceStepKindSchema = z.enum(['click', 'input', 'key', 'navigation', 'scroll']);
export const traceConsoleLevelSchema = z.enum(['log', 'info', 'warn', 'error', 'debug']);

// Every `t` is milliseconds from the trace's start, never wall-clock — a trace is read as a relative
// timeline, and its absolute start lives once, on the trace itself.
export const traceStepSchema = z.object({
  t: z.number(),
  kind: traceStepKindSchema,
  selector: z.string().nullish(),
  text: z.string().nullish(),
  url: z.string().nullish(),
});

export const traceConsoleEntrySchema = z.object({
  t: z.number(),
  level: traceConsoleLevelSchema,
  text: z.string(),
  stack: z.string().nullish(),
});

export const traceNetworkEntrySchema = z.object({
  t: z.number(),
  method: z.string(),
  url: z.string(),
  status: z.number(),
  durationMs: z.number(),
  failed: z.boolean().default(false),
  requestBody: z.string().nullish(),
  responseBody: z.string().nullish(),
  headers: z.record(z.string()).nullish(),
});

export const traceStateEntrySchema = z.object({
  t: z.number(),
  action: z.string(),
  diff: z.unknown().nullish(),
});

export const traceSummarySchema = z.object({
  steps: z.number(),
  consoleErrors: z.number(),
  failedRequests: z.number(),
  stateActions: z.number(),
});

export const traceSourcesSchema = z.object({
  network: traceSourceSchema,
  console: traceSourceSchema,
  state: traceStateSourceSchema,
});

export const traceFilesSchema = z.object({
  trace: z.string(),
  replay: z.string().optional(),
  video: z.string().optional(),
});

// What the session manifest carries: metadata and counts only. The channels themselves live in the
// sibling trace.json, so a manifest stays small enough to read whole.
export const caliperTraceSchema = z.object({
  id: z.string(),
  label: z.string(),
  startedAt: z.string().datetime(),
  durationMs: z.number(),
  truncated: z.boolean().default(false),
  page: pageSchema,
  sources: traceSourcesSchema,
  summary: traceSummarySchema,
  files: traceFilesSchema,
});

export const traceDetailSchema = z.object({
  traceId: z.string(),
  schemaVersion: z.literal(2).default(2),
  steps: z.array(traceStepSchema).default([]),
  console: z.array(traceConsoleEntrySchema).default([]),
  network: z.array(traceNetworkEntrySchema).default([]),
  state: z.array(traceStateEntrySchema).default([]),
  // The full store state is snapshotted at the ends only; a payload per action would dwarf every other
  // channel, so `state[].diff` carries them and only while they fit under the assembler's cap.
  stateSnapshots: z.object({start: z.unknown().optional(), end: z.unknown().optional()}).default({}),
});

export type TraceSource = z.infer<typeof traceSourceSchema>;
export type TraceStateSource = z.infer<typeof traceStateSourceSchema>;
export type TraceStepKind = z.infer<typeof traceStepKindSchema>;
export type TraceConsoleLevel = z.infer<typeof traceConsoleLevelSchema>;
export type TraceStep = z.infer<typeof traceStepSchema>;
export type TraceConsoleEntry = z.infer<typeof traceConsoleEntrySchema>;
export type TraceNetworkEntry = z.infer<typeof traceNetworkEntrySchema>;
export type TraceStateEntry = z.infer<typeof traceStateEntrySchema>;
export type TraceSummary = z.infer<typeof traceSummarySchema>;
export type TraceSources = z.infer<typeof traceSourcesSchema>;
export type TraceFiles = z.infer<typeof traceFilesSchema>;
export type CaliperTrace = z.infer<typeof caliperTraceSchema>;
export type TraceDetail = z.infer<typeof traceDetailSchema>;
