import {describe, expect, it} from 'vitest';
import type {TraceNetworkEntry} from '@caliper/core';
import {patchFetch, type FetchHost} from './network-collector';

describe('patchFetch', () => {
  it('records a successful request', async () => {
    const entries: TraceNetworkEntry[] = [];
    let clock = 0;
    const host: FetchHost = {fetch: async () => new Response('{"ok":true}', {status: 200})};
    patchFetch(
      host,
      (entry) => entries.push(entry),
      () => (clock += 50),
    );

    await host.fetch('https://api.test/orders', {method: 'POST'});

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.test/orders',
      status: 200,
      failed: false,
    });
  });

  it('flags a non-2xx response as failed', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host: FetchHost = {fetch: async () => new Response('nope', {status: 500})};
    patchFetch(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    await host.fetch('https://api.test/orders');

    expect(entries[0]?.failed).toBe(true);
    expect(entries[0]?.status).toBe(500);
  });

  it('records a thrown network error as status 0 and rethrows', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host: FetchHost = {
      fetch: async (): Promise<Response> => {
        throw new TypeError('Failed to fetch');
      },
    };
    patchFetch(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    await expect(host.fetch('https://api.test/orders')).rejects.toThrow('Failed to fetch');
    expect(entries[0]).toMatchObject({status: 0, failed: true});
  });

  it('defaults the method to GET', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host: FetchHost = {fetch: async () => new Response(null, {status: 204})};
    patchFetch(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    await host.fetch('https://api.test/ping');

    expect(entries[0]?.method).toBe('GET');
  });

  it('restores the original fetch on uninstall', () => {
    const original = async (): Promise<Response> => new Response('');
    const host: FetchHost = {fetch: original};
    patchFetch(
      host,
      () => undefined,
      () => 0,
    )();
    expect(host.fetch).toBe(original);
  });
});
