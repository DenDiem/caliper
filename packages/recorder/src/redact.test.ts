import {describe, expect, it} from 'vitest';
import type {TraceNetworkEntry} from '@caliper/core';
import {redactNetworkEntry} from './redact';

const entry: TraceNetworkEntry = {
  t: 10,
  method: 'POST',
  url: 'https://api.test/login',
  status: 200,
  durationMs: 40,
  failed: false,
  requestBody: '{"email":"a@b.c","password":"hunter2"}',
  headers: {Authorization: 'Bearer abc.def', 'Content-Type': 'application/json'},
};

describe('redactNetworkEntry', () => {
  it('returns the entry untouched when redaction is off', () => {
    expect(redactNetworkEntry(entry, false)).toBe(entry);
  });

  it('masks credential headers when redaction is on', () => {
    const redacted = redactNetworkEntry(entry, true);
    expect(redacted.headers).toEqual({
      Authorization: '[redacted]',
      'Content-Type': 'application/json',
    });
  });

  it('masks secret-looking body fields when redaction is on', () => {
    const redacted = redactNetworkEntry(entry, true);
    expect(redacted.requestBody).toBe('{"email":"a@b.c","password":"[redacted]"}');
  });

  it('leaves a body it cannot parse alone', () => {
    const redacted = redactNetworkEntry({...entry, requestBody: 'not json'}, true);
    expect(redacted.requestBody).toBe('not json');
  });
});
