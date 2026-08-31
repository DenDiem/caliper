import type {TraceStateEntry, TraceStateSource} from '@caliper/core';

interface DevtoolsConnection {
  init?: (state: unknown) => void;
  send: (action: unknown, state: unknown) => void;
  subscribe?: (listener: (message: unknown) => void) => () => void;
  unsubscribe?: () => void;
}

export interface DevtoolsExtension {
  connect: (options?: unknown) => DevtoolsConnection;
}

export interface DevtoolsHost {
  __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension;
}

export interface StateBridge {
  readonly source: TraceStateSource;
  snapshot: () => unknown;
  uninstall: () => void;
}

const actionType = (action: unknown): string => {
  if (typeof action === 'string') return action;
  if (typeof action === 'object' && action !== null) {
    const type: unknown = Reflect.get(action, 'type');
    if (typeof type === 'string') return type;
  }
  return 'unknown';
};

// NgRx, Redux and Zustand all probe this hook exactly once, during bootstrap — which is why the host
// script runs at document_start. When the real Redux DevTools extension is already present its
// connect() is wrapped rather than replaced: breaking a developer's devtools to record a trace is the
// worse outcome, so both receive every message.
export const installStateBridge = (
  host: DevtoolsHost,
  sink: (entry: TraceStateEntry) => void,
  now: () => number,
): StateBridge => {
  const original = host.__REDUX_DEVTOOLS_EXTENSION__;
  let latest: unknown = undefined;

  const wrap = (connection: DevtoolsConnection | undefined): DevtoolsConnection => ({
    init: (state: unknown): void => {
      latest = state;
      connection?.init?.(state);
    },
    send: (action: unknown, state: unknown): void => {
      latest = state;
      sink({t: now(), action: actionType(action)});
      connection?.send(action, state);
    },
    subscribe: (listener: (message: unknown) => void) =>
      connection?.subscribe?.(listener) ?? ((): void => undefined),
    unsubscribe: () => connection?.unsubscribe?.(),
  });

  host.__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: (options?: unknown): DevtoolsConnection => wrap(original?.connect(options)),
  };

  return {
    source: 'devtools-bridge',
    snapshot: () => latest,
    uninstall: () => {
      if (original) host.__REDUX_DEVTOOLS_EXTENSION__ = original;
      else delete host.__REDUX_DEVTOOLS_EXTENSION__;
    },
  };
};
