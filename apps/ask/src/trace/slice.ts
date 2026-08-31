import type {TraceDetail} from '@caliper/core';

export type TraceChannel = 'steps' | 'console' | 'network' | 'state';

export const ALL_CHANNELS: readonly TraceChannel[] = ['steps', 'console', 'network', 'state'];

export interface TraceFilter {
  channels: ReadonlySet<TraceChannel>;
  aroundMs: number | null;
  windowMs: number;
}

const BODY_PREVIEW = 400;

const inWindow = (t: number, filter: TraceFilter): boolean =>
  filter.aroundMs === null || Math.abs(t - filter.aroundMs) <= filter.windowMs;

const section = (name: string, lines: readonly string[]): string =>
  [`${name}[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join('\n');

const truncate = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, limit)}…` : value;

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
      .map((entry) => `${entry.t} ${entry.level} ${entry.text}`);
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
        const body = entry.responseBody
          ? `\n    body: ${truncate(entry.responseBody, BODY_PREVIEW)}`
          : '';
        return `${head}${body}`;
      });
    total += lines.length;
    sections.push(section('network', lines));
  }

  if (filter.channels.has('state')) {
    const lines = detail.state
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => `${entry.t} ${entry.action}`);
    total += lines.length;
    sections.push(section('state', lines));
  }

  const body = sections.join('\n\n');
  return total === 0 ? `${body}\n\nnothing recorded in this window` : body;
};
