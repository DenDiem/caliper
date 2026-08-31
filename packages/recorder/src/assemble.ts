import type {
  CaliperTrace,
  Page,
  TraceConsoleEntry,
  TraceDetail,
  TraceFiles,
  TraceNetworkEntry,
  TraceSources,
  TraceStateEntry,
  TraceStep,
} from '@caliper/core';
import {redactNetworkEntry} from './redact';

export interface AssembleInput {
  id: string;
  label: string;
  startedAt: string;
  durationMs: number;
  truncated: boolean;
  page: Page;
  sources: TraceSources;
  steps: readonly TraceStep[];
  console: readonly TraceConsoleEntry[];
  network: readonly TraceNetworkEntry[];
  state: readonly TraceStateEntry[];
  stateSnapshots: {start?: unknown; end?: unknown};
  files: TraceFiles;
  redactSecrets: boolean;
  maxStateDiffBytes: number;
}

const byTime = <T extends {t: number}>(entries: readonly T[]): T[] =>
  [...entries].sort((left, right) => left.t - right.t);

const sizeOf = (value: unknown): number => {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

// An action type is always worth keeping; its payload only while it stays small. A full NgRx payload
// per action would outweigh every other channel combined.
const capDiff = (entry: TraceStateEntry, maxBytes: number): TraceStateEntry => {
  if (entry.diff === undefined || entry.diff === null) return entry;
  if (sizeOf(entry.diff) <= maxBytes) return entry;
  const {diff: _dropped, ...rest} = entry;
  return rest;
};

export const assembleTrace = (input: AssembleInput): {trace: CaliperTrace; detail: TraceDetail} => {
  const steps = byTime(input.steps);
  const consoleEntries = byTime(input.console);
  const network = byTime(input.network).map((entry) =>
    redactNetworkEntry(entry, input.redactSecrets),
  );
  const state = byTime(input.state).map((entry) => capDiff(entry, input.maxStateDiffBytes));

  const trace: CaliperTrace = {
    id: input.id,
    label: input.label,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    truncated: input.truncated,
    page: input.page,
    sources: input.sources,
    summary: {
      steps: steps.length,
      consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
      failedRequests: network.filter((entry) => entry.failed).length,
      stateActions: state.length,
    },
    files: input.files,
  };

  const detail: TraceDetail = {
    traceId: input.id,
    schemaVersion: 2,
    steps,
    console: consoleEntries,
    network,
    state,
    stateSnapshots: input.stateSnapshots,
  };

  return {trace, detail};
};
