import type {TraceDetail} from '@caliper/core';

export type TraceChannel = 'steps' | 'console' | 'network' | 'state';

export const ALL_CHANNELS: readonly TraceChannel[] = ['steps', 'console', 'network', 'state'];

export interface TraceFilter {
  channels: ReadonlySet<TraceChannel>;
  aroundMs: number | null;
  windowMs: number;
  // Without this the reader could not show request bodies, headers, stacks or state diffs at all, so an
  // agent that needed them had no option but to open the whole file — the outcome slicing exists to
  // avoid. Off by default because a windowed slice is the common case and stays small.
  full?: boolean;
}

const BODY_PREVIEW = 400;

const inWindow = (t: number, filter: TraceFilter): boolean =>
  filter.aroundMs === null || Math.abs(t - filter.aroundMs) <= filter.windowMs;

const section = (name: string, lines: readonly string[]): string =>
  [`${name}[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join('\n');

// The marker matters: a body cut mid-JSON with no sign of it reads as malformed data from the server
// rather than as a preview.
const truncate = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, limit)}… [truncated, --full for all of it]` : value;

const indent = (label: string, value: string): string =>
  `\n    ${label}: ${value.replace(/\n/g, '\n      ')}`;

// The zoom-in half of the reading contract: pull prints the summary, this prints the slice that summary
// pointed at. Both exist so a trace's bodies never enter an agent's context wholesale.
export const sliceTrace = (detail: TraceDetail, filter: TraceFilter): string => {
  const sections: string[] = [];
  let total = 0;

  if (filter.channels.has('steps')) {
    const lines = detail.steps
      .filter((step) => inWindow(step.t, filter))
      .map((step) =>
        `${step.t} ${step.kind} ${step.selector ?? step.url ?? ''} ${step.text ?? ''}`.trimEnd(),
      );
    total += lines.length;
    sections.push(section('steps', lines));
  }

  if (filter.channels.has('console')) {
    const lines = detail.console
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => {
        const head = `${entry.t} ${entry.level} ${entry.text}`;
        return filter.full && entry.stack ? `${head}${indent('stack', entry.stack)}` : head;
      });
    total += lines.length;
    sections.push(section('console', lines));
  }

  if (filter.channels.has('network')) {
    const lines = detail.network
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => {
        const head = `${entry.t} ${entry.method} ${entry.url} ${entry.status}${
          entry.failed ? ' FAILED' : ''
        } ${entry.durationMs}ms`;
        const parts = [head];

        if (filter.full && entry.headers && Object.keys(entry.headers).length > 0) {
          parts.push(
            indent(
              'headers',
              Object.entries(entry.headers)
                .map(([name, value]) => `${name}: ${value}`)
                .join('\n'),
            ),
          );
        }
        if (filter.full && entry.requestBody) parts.push(indent('request', entry.requestBody));
        if (entry.responseBody) {
          parts.push(
            indent(
              'body',
              filter.full ? entry.responseBody : truncate(entry.responseBody, BODY_PREVIEW),
            ),
          );
        }
        return parts.join('');
      });
    total += lines.length;
    sections.push(section('network', lines));
  }

  if (filter.channels.has('state')) {
    const lines = detail.state
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => {
        const head = `${entry.t} ${entry.action}`;
        return filter.full && entry.diff !== undefined && entry.diff !== null
          ? `${head}${indent('diff', JSON.stringify(entry.diff))}`
          : head;
      });
    total += lines.length;
    sections.push(section('state', lines));

    // The store at the ends of the recording answers "what did it look like before and after", which no
    // per-action line can. Only under --full: these are whole application states.
    if (filter.full && filter.aroundMs === null) {
      for (const [edge, value] of Object.entries(detail.stateSnapshots)) {
        if (value !== undefined) sections.push(`state.${edge}:\n  ${JSON.stringify(value)}`);
      }
    }
  }

  const body = sections.join('\n\n');
  return total === 0 ? `${body}\n\nnothing recorded in this window` : body;
};
