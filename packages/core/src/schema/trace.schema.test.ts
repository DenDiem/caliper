import {describe, expect, it} from 'vitest';
import {caliperSessionSchema} from './annotation.schema';
import {caliperTraceSchema, traceDetailSchema} from './trace.schema';

const trace = {
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_000,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
  files: {trace: 'caliper-a3f0c1d2-t1.trace.json'},
};

describe('caliperTraceSchema', () => {
  it('parses a trace and defaults truncated to false', () => {
    const parsed = caliperTraceSchema.parse(trace);
    expect(parsed.truncated).toBe(false);
    expect(parsed.files.video).toBeUndefined();
  });

  it('rejects an unknown network source', () => {
    expect(() =>
      caliperTraceSchema.parse({...trace, sources: {...trace.sources, network: 'guess'}}),
    ).toThrow();
  });
});

describe('traceDetailSchema', () => {
  it('defaults every channel to an empty list', () => {
    const parsed = traceDetailSchema.parse({traceId: trace.id});
    expect(parsed).toMatchObject({steps: [], console: [], network: [], state: [], stateSnapshots: {}});
    expect(parsed.schemaVersion).toBe(2);
  });

  it('keeps a failed request flagged', () => {
    const parsed = traceDetailSchema.parse({
      traceId: trace.id,
      network: [
        {t: 1200, method: 'POST', url: 'https://api.test/orders', status: 500, durationMs: 340, failed: true},
      ],
    });
    expect(parsed.network[0].failed).toBe(true);
  });
});

describe('caliperSessionSchema', () => {
  const session = {
    id: 'b1',
    createdAt: '2026-08-31T10:00:00.000Z',
    caliperVersion: '0.1.0',
    annotations: [],
    assets: {},
  };

  it('still parses a v1 session and gives it an empty traces list', () => {
    const parsed = caliperSessionSchema.parse(session);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.traces).toEqual([]);
  });

  it('parses a v2 session carrying a trace', () => {
    const parsed = caliperSessionSchema.parse({...session, schemaVersion: 2, traces: [trace]});
    expect(parsed.traces).toHaveLength(1);
  });
});
