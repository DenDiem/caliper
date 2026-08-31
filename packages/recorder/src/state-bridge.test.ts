import {describe, expect, it, vi} from 'vitest';
import type {TraceStateEntry} from '@caliper/core';
import {installStateBridge, type DevtoolsHost} from './state-bridge';

describe('installStateBridge', () => {
  it('installs a shim when the page has no devtools hook', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    const bridge = installStateBridge(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    expect(bridge.source).toBe('devtools-bridge');
    expect(host.__REDUX_DEVTOOLS_EXTENSION__).toBeDefined();
  });

  it('records the action type and the latest state from a connected store', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    let clock = 0;
    const bridge = installStateBridge(
      host,
      (entry) => entries.push(entry),
      () => (clock += 10),
    );

    const connection = host.__REDUX_DEVTOOLS_EXTENSION__!.connect({name: 'app'});
    connection.init?.({count: 0});
    connection.send({type: '[Orders] Load'}, {count: 1});

    expect(entries).toEqual([{t: 10, action: '[Orders] Load'}]);
    expect(bridge.snapshot()).toEqual({count: 1});
  });

  it('accepts a bare string action type', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    installStateBridge(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    host.__REDUX_DEVTOOLS_EXTENSION__!.connect().send('INCREMENT', {count: 1});

    expect(entries[0].action).toBe('INCREMENT');
  });

  it('wraps an existing hook instead of replacing it', () => {
    const realConnection = {init: vi.fn(), send: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn()};
    const realConnect = vi.fn(() => realConnection);
    const host: DevtoolsHost = {__REDUX_DEVTOOLS_EXTENSION__: {connect: realConnect}};
    const entries: TraceStateEntry[] = [];
    installStateBridge(
      host,
      (entry) => entries.push(entry),
      () => 0,
    );

    host.__REDUX_DEVTOOLS_EXTENSION__!.connect({name: 'app'}).send({type: 'PING'}, {});

    expect(realConnect).toHaveBeenCalledWith({name: 'app'});
    expect(realConnection.send).toHaveBeenCalled();
    expect(entries[0].action).toBe('PING');
  });

  it('restores the original hook on uninstall', () => {
    const real = {connect: vi.fn()};
    const host: DevtoolsHost = {__REDUX_DEVTOOLS_EXTENSION__: real};
    installStateBridge(
      host,
      () => undefined,
      () => 0,
    ).uninstall();
    expect(host.__REDUX_DEVTOOLS_EXTENSION__).toBe(real);
  });
});
