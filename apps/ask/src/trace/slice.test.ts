import {describe, expect, it} from 'vitest';
import type {TraceDetail} from '@caliper/core';
import {ALL_CHANNELS, sliceTrace, type TraceChannel} from './slice';

const detail: TraceDetail = {
  traceId: 'a3f0c1d2-0000-4000-8000-000000000001',
  schemaVersion: 2,
  steps: [
    {t: 1000, kind: 'click', selector: 'button.save', text: 'Save'},
    {t: 12_400, kind: 'click', selector: 'button.save', text: 'Save'},
  ],
  console: [{t: 12_500, level: 'error', text: 'TypeError: order is undefined'}],
  network: [
    {t: 1100, method: 'POST', url: 'https://api.test/orders', status: 201, durationMs: 90, failed: false},
    {t: 12_450, method: 'POST', url: 'https://api.test/orders', status: 500, durationMs: 120, failed: true},
  ],
  state: [{t: 12_460, action: '[Orders] Save Failure'}],
  stateSnapshots: {},
};

const all = new Set<TraceChannel>(ALL_CHANNELS);

describe('sliceTrace', () => {
  it('prints every channel by default', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: null, windowMs: 2000});
    expect(output).toContain('steps[2]');
    expect(output).toContain('console[1]');
    expect(output).toContain('network[2]');
    expect(output).toContain('state[1]');
  });

  it('prints only the requested channel', () => {
    const output = sliceTrace(detail, {
      channels: new Set<TraceChannel>(['network']),
      aroundMs: null,
      windowMs: 2000,
    });
    expect(output).toContain('network[2]');
    expect(output).not.toContain('steps[');
  });

  it('windows every channel around a timestamp', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: 12_400, windowMs: 2000});
    expect(output).toContain('steps[1]');
    expect(output).toContain('12500');
    expect(output).not.toContain('1000 click');
    expect(output).toContain('network[1]');
  });

  it('marks a failed request', () => {
    const output = sliceTrace(detail, {
      channels: new Set<TraceChannel>(['network']),
      aroundMs: null,
      windowMs: 2000,
    });
    expect(output).toContain('FAILED');
  });

  it('says so when a window catches nothing', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: 90_000, windowMs: 1000});
    expect(output).toContain('nothing recorded in this window');
  });
});

describe('sliceTrace --full', () => {
  const rich: TraceDetail = {
    ...detail,
    console: [
      {t: 12_500, level: 'error', text: 'TypeError: order is undefined', stack: 'at submit (app.js:12)'},
    ],
    network: [
      {
        t: 12_450,
        method: 'POST',
        url: 'https://api.test/orders',
        status: 409,
        durationMs: 120,
        failed: true,
        headers: {authorization: 'Bearer demo'},
        requestBody: '{"quantity":2}',
        responseBody: 'x'.repeat(900),
      },
    ],
    state: [{t: 12_460, action: '[Orders] Save Failure', diff: {orders: 1}}],
    stateSnapshots: {start: {orders: 0}, end: {orders: 1}},
  };

  const slice = (full: boolean, aroundMs: number | null = null): string =>
    sliceTrace(rich, {channels: all, aroundMs, windowMs: 2000, full});

  // Without --full the reader could not show any of this, so an agent that needed it had to open the
  // whole file — the outcome the summary-first design exists to prevent.
  it('shows request headers and bodies only when asked', () => {
    expect(slice(false)).not.toContain('authorization');
    expect(slice(true)).toContain('authorization: Bearer demo');
    expect(slice(true)).toContain('request: {"quantity":2}');
  });

  it('shows the console stack and the state diff only when asked', () => {
    expect(slice(false)).not.toContain('at submit');
    expect(slice(true)).toContain('at submit (app.js:12)');
    expect(slice(true)).toContain('diff: {"orders":1}');
  });

  it('marks a preview as cut instead of letting it read as malformed data', () => {
    expect(slice(false)).toContain('[truncated, --full for all of it]');
    expect(slice(true)).not.toContain('[truncated');
  });

  it('adds the store snapshots to a whole-trace read, not a windowed one', () => {
    expect(slice(true)).toContain('state.start:');
    expect(slice(true, 12_450)).not.toContain('state.start:');
  });
});
