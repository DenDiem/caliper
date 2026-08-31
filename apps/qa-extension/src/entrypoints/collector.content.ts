import {buildSelector} from '@caliper/core';
import type {TraceConsoleEntry, TraceNetworkEntry, TraceStateEntry, TraceStep} from '@caliper/core';
import {
  createRingBuffer,
  describeStep,
  installStateBridge,
  navigationStep,
  patchConsole,
  patchFetch,
} from '@caliper/recorder';
import type {DevtoolsExtension} from '@caliper/recorder';

// The hook the state bridge installs is a real property of the page's window; declaring it keeps the
// bridge's host parameter structurally satisfied without a cast.
declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension;
  }
}

// A trace step wants an anchor, not the picker's full verdict — the strategy and confidence a mark
// carries are meaningless for "the tester clicked here".
const selectorOf = (element: Element): string => buildSelector(element).selector;

const HOST_SOURCE = 'caliper-host';
const COLLECTOR_SOURCE = 'caliper-collector';
const FLUSH_INTERVAL_MS = 1000;
const CHANNEL_CAPACITY = 5000;
const REPLAY_CAPACITY = 20_000;
const OBSERVED_EVENTS = ['click', 'input', 'change', 'keydown'] as const;

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const steps = createRingBuffer<TraceStep>(0);
    const consoleEntries = createRingBuffer<TraceConsoleEntry>(0);
    const network = createRingBuffer<TraceNetworkEntry>(0);
    const state = createRingBuffer<TraceStateEntry>(0);
    const replay = createRingBuffer<string>(0);

    let startedAt: number | null = null;
    let offsetMs = 0;
    let flushTimer: number | null = null;
    let stopReplay: (() => void) | null = null;

    // Offset by however long the trace had already been running when this document took over, so a
    // reproduction that crosses a page load reads as one timeline.
    const now = (): number =>
      startedAt === null ? 0 : Math.round(offsetMs + performance.now() - startedAt);

    // Installed on load, not on Start: NgRx and Redux probe the devtools hook once during bootstrap,
    // so by the time the tester presses Start it is already far too late to be found.
    const bridge = installStateBridge(window, (entry) => state.push(entry), now);
    patchConsole(
      console,
      (entry) => {
        if (startedAt !== null) consoleEntries.push(entry);
      },
      now,
    );
    patchFetch(window, (entry) => network.push(entry), now);

    // buildSelector walks ancestors running querySelectorAll, and the console patch stringifies every
    // argument. Both used to run on every page whether or not anything was recording, and only then push
    // into a zero-capacity buffer — the cost the ring buffer was supposed to avoid.
    const onEvent = (event: Event): void => {
      if (startedAt === null) return;
      const step = describeStep(event, now(), selectorOf);
      if (step) steps.push(step);
    };

    for (const type of OBSERVED_EVENTS) {
      window.addEventListener(type, onEvent, {capture: true, passive: true});
    }

    // postMessage structured-clones the batch, and an app's store legitimately holds functions, DOM
    // nodes and proxies — none of which clone. Sending the snapshot separately means a store that
    // cannot cross the boundary costs the snapshot alone, not the second of steps, console, network,
    // state and replay that was drained alongside it.
    const post = (batch: unknown): boolean => {
      try {
        window.postMessage({source: COLLECTOR_SOURCE, kind: 'batch', batch}, '*');
        return true;
      } catch {
        return false;
      }
    };

    const flush = (): void => {
      const batch = {
        dropped: [steps, consoleEntries, network, state, replay].some((buffer) => buffer.dropped),
        steps: steps.drain(),
        console: consoleEntries.drain(),
        network: network.drain(),
        state: state.drain(),
        replay: replay.drain(),
      };

      if (!post(batch)) return;

      const snapshot = bridge.snapshot();
      if (snapshot !== undefined) post({snapshotOnly: true, stateSnapshot: snapshot});
    };

    const start = async (elapsedMs: number): Promise<void> => {
      if (startedAt !== null) return;
      startedAt = performance.now();
      offsetMs = elapsedMs;

      steps.setCapacity(CHANNEL_CAPACITY);
      consoleEntries.setCapacity(CHANNEL_CAPACITY);
      network.setCapacity(CHANNEL_CAPACITY);
      state.setCapacity(CHANNEL_CAPACITY);
      replay.setCapacity(REPLAY_CAPACITY);
      steps.push(navigationStep(now(), location.href));

      // The periodic flush is armed before rrweb loads: a replay that fails to start must not also cost
      // the steps, console, network and state the rest of the collector is already recording.
      flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);

      try {
        const {record} = await import('rrweb');
        stopReplay = record({emit: (event) => replay.push(JSON.stringify(event))}) ?? null;
      } catch (error) {
        console.warn('[caliper] DOM replay unavailable for this trace', error);
      }
    };

    const stop = (): void => {
      stopReplay?.();
      stopReplay = null;
      if (flushTimer !== null) window.clearInterval(flushTimer);
      flushTimer = null;
      flush();
      for (const buffer of [steps, consoleEntries, network, state, replay]) buffer.setCapacity(0);
      startedAt = null;
      offsetMs = 0;
    };

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if (Reflect.get(data, 'source') !== HOST_SOURCE) return;

      const kind = Reflect.get(data, 'kind');
      if (kind === 'start') {
        const elapsed = Reflect.get(data, 'elapsedMs');
        void start(typeof elapsed === 'number' ? elapsed : 0);
      }
      if (kind === 'stop') stop();
    });
  },
});
