import {describe, expect, it} from 'vitest';
import type {CaliperTrace} from '../schema/trace.schema';
import {traceBlock} from './trace-toon';

const trace: CaliperTrace = {
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_400,
  truncated: false,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
  files: {
    trace: 'caliper-a3f0c1d2-t1.trace.json',
    replay: 'caliper-a3f0c1d2-t1.replay.ndjson.gz',
    video: 'caliper-a3f0c1d2-t1.webm',
  },
};

describe('traceBlock', () => {
  it('leads with the id, duration and label', () => {
    expect(traceBlock(trace)).toContain('a3f0c1d2 24.4s "Save fails on second submit"');
  });

  it('reports the counts and the detail file', () => {
    const block = traceBlock(trace);
    expect(block).toContain('summary: 7 steps, 2 console errors, 1 failed request, 12 state actions');
    expect(block).toContain('trace: caliper-a3f0c1d2-t1.trace.json');
  });

  it('never names the video file', () => {
    expect(traceBlock(trace)).not.toContain('.webm');
  });

  it('flags a fallback network source', () => {
    const block = traceBlock({...trace, sources: {...trace.sources, network: 'fallback'}});
    expect(block).toContain('network captured in fallback mode — request/response bodies may be missing');
  });

  it('flags truncation', () => {
    expect(traceBlock({...trace, truncated: true})).toContain('truncated:');
  });

  // The whole point of recording the cause: the length limit stops the recording, so the END is gone,
  // while an overflow drops the head. Saying the wrong one sends the agent to the missing half.
  it('says the end is missing when the length limit stopped the recording', () => {
    const block = traceBlock({...trace, truncated: true, truncatedBy: 'length-limit'});
    expect(block).toContain('END of the reproduction is missing');
    expect(block).not.toContain('EARLIEST');
  });

  it('says the earliest events went when a buffer overflowed', () => {
    const block = traceBlock({...trace, truncated: true, truncatedBy: 'buffer-overflow'});
    expect(block).toContain('EARLIEST events were dropped');
  });

  it('says the channels are intact when only the video window was trimmed', () => {
    const block = traceBlock({...trace, truncated: true, truncatedBy: 'video-window'});
    expect(block).toContain('trace channels themselves are complete');
  });

  it('admits it does not know on a trace recorded before the cause was kept', () => {
    const block = traceBlock({...trace, truncated: true});
    expect(block).toContain('which end is missing was not recorded');
  });
});
