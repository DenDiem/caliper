import {describe, expect, it} from 'vitest';
import type {TraceNetworkEntry} from '@caliper/core';
import {redactConsoleEntry, redactNetworkEntry, redactSnapshot, redactStateEntry} from './redact';

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

  // Headers were the least-exposed surface of the three. A single-page app keeps its session in the
  // store and OAuth puts tokens in the query string, so masking only headers protected almost nothing.
  it('masks a token carried in the query string', () => {
    const masked = redactNetworkEntry({...entry, url: 'https://api.test/cb?code=abc&access_token=xyz'}, true);
    expect(masked.url).toBe('https://api.test/cb?code=abc&access_token=[redacted]');
  });

  it('leaves a url with no query string alone', () => {
    expect(redactNetworkEntry(entry, true).url).toBe('https://api.test/login');
  });
});

describe('redactStateEntry', () => {
  it('masks secrets inside a state diff', () => {
    const masked = redactStateEntry({t: 1, action: '[Auth] Ok', diff: {token: 'abc', name: 'Lee'}}, true);
    expect(masked.diff).toEqual({token: '[redacted]', name: 'Lee'});
  });

  it('leaves an action with no diff alone', () => {
    const entry = {t: 1, action: '[Auth] Ok'};
    expect(redactStateEntry(entry, true)).toBe(entry);
  });
});

describe('redactSnapshot', () => {
  it('masks the store the app was holding', () => {
    expect(redactSnapshot({auth: {accessToken: 'abc'}}, true)).toEqual({auth: {accessToken: '[redacted]'}});
  });
});

describe('redactConsoleEntry', () => {
  it('masks a bearer token logged to the console', () => {
    const masked = redactConsoleEntry({t: 1, level: 'log', text: 'sending Bearer abc.def.ghi now'}, true);
    expect(masked.text).toBe('sending [redacted] now');
  });

  it('leaves ordinary log text alone', () => {
    const entry = {t: 1, level: 'log' as const, text: 'saved order 4417'};
    expect(redactConsoleEntry(entry, true).text).toBe('saved order 4417');
  });
});
