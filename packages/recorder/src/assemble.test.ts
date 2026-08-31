import {describe, expect, it} from 'vitest';
import {caliperTraceSchema, traceDetailSchema} from '@caliper/core';
import {assembleTrace, type AssembleInput} from './assemble';

const input = (overrides: Partial<AssembleInput> = {}): AssembleInput => ({
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_400,
  truncated: false,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  steps: [{t: 100, kind: 'click', selector: 'button'}],
  console: [
    {t: 200, level: 'log', text: 'ok'},
    {t: 300, level: 'error', text: 'boom'},
  ],
  network: [
    {t: 400, method: 'GET', url: 'https://api.test/a', status: 200, durationMs: 20, failed: false},
    {t: 500, method: 'POST', url: 'https://api.test/b', status: 500, durationMs: 30, failed: true},
  ],
  state: [{t: 600, action: '[Orders] Load'}],
  stateSnapshots: {start: {count: 0}, end: {count: 1}},
  files: {trace: 'caliper-a3f0c1d2-t1.trace.json'},
  redactSecrets: false,
  maxStateDiffBytes: 2048,
  ...overrides,
});

describe('assembleTrace', () => {
  it('counts errors and failures into the summary', () => {
    const {trace} = assembleTrace(input());
    expect(trace.summary).toEqual({steps: 1, consoleErrors: 1, failedRequests: 1, stateActions: 1});
  });

  it('produces a detail carrying every channel', () => {
    const {detail} = assembleTrace(input());
    expect(detail.traceId).toBe('a3f0c1d2-0000-4000-8000-000000000001');
    expect(detail.network).toHaveLength(2);
    expect(detail.stateSnapshots.end).toEqual({count: 1});
  });

  it('applies redaction when asked', () => {
    const {detail} = assembleTrace(
      input({
        redactSecrets: true,
        network: [
          {
            t: 1,
            method: 'POST',
            url: 'https://api.test/login',
            status: 200,
            durationMs: 5,
            failed: false,
            headers: {Authorization: 'Bearer x'},
          },
        ],
      }),
    );
    expect(detail.network[0].headers).toEqual({Authorization: '[redacted]'});
  });

  it('drops a state diff that exceeds the cap but keeps the action', () => {
    const {detail} = assembleTrace(
      input({
        maxStateDiffBytes: 10,
        state: [{t: 1, action: '[Big] Load', diff: {payload: 'x'.repeat(500)}}],
      }),
    );
    expect(detail.state[0]).toEqual({t: 1, action: '[Big] Load'});
  });

  it('sorts every channel by time', () => {
    const {detail} = assembleTrace(
      input({
        steps: [
          {t: 900, kind: 'click'},
          {t: 100, kind: 'click'},
        ],
      }),
    );
    expect(detail.steps.map((step) => step.t)).toEqual([100, 900]);
  });

  it('emits a trace that satisfies the schema', () => {
    const {trace, detail} = assembleTrace(input());
    expect(() => caliperTraceSchema.parse(trace)).not.toThrow();
    expect(() => traceDetailSchema.parse(detail)).not.toThrow();
  });
});
