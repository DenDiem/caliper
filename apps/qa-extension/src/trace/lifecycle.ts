import type {Page, TraceSources} from '@caliper/core';
import {assembleTrace} from '@caliper/recorder';
import type {TraceBatch, TraceStatusMessage} from '../messaging/messages';
import {runOp} from '../sinks/store';
import {attachCdp, type CdpCollector} from './cdp';
import {putBlob} from './blob-store';
import {readTraceOptions} from './options';
import {pushVideoFrame, startFrameVideo, startVideo, stopVideo} from './video';

const ID_LENGTH = 8;
// A service worker can be unloaded whenever it goes quiet — and the page hanging is a plausible thing
// for the bug being recorded to do. setTimeout dies with the worker; an alarm does not.
const LIMIT_ALARM = 'caliper.trace.limit';
// Written on every batch so a restarted worker can tell that a trace was in progress and say so,
// rather than the recording evaporating with the panel still claiming nothing is wrong.
const ACTIVE_KEY = 'caliper.trace.active';
const MAX_STATE_DIFF_BYTES = 2048;
// The collector's last flush travels page -> bridge -> background, so it lands a hop after Stop is
// sent. Tearing the trace down synchronously threw away everything recorded since the previous tick.
const FINAL_FLUSH_GRACE_MS = 400;

const IDLE_STATUS: TraceStatusMessage = {
  type: 'caliper/trace-status',
  recording: false,
  startedAt: null,
  consoleErrors: 0,
  failedRequests: 0,
};

interface ActiveTrace {
  id: string;
  tabId: number;
  label: string;
  startedAt: string;
  startedAtMs: number;
  page: Page;
  cdp: CdpCollector | null;
  batches: TraceBatch[];
  stateStart: unknown;
  stateEnd: unknown;
  stateStartSeen: boolean;
  stopping: boolean;
  overran: boolean;
  dpr: number;
}

interface ActiveMarker {
  id: string;
  tabId: number;
  label: string;
  startedAt: string;
}

let active: ActiveTrace | null = null;

const markActive = (trace: ActiveTrace | null): void => {
  if (!trace) {
    void chrome.storage.session.remove(ACTIVE_KEY);
    return;
  }
  const marker: ActiveMarker = {
    id: trace.id,
    tabId: trace.tabId,
    label: trace.label,
    startedAt: trace.startedAt,
  };
  void chrome.storage.session.set({[ACTIVE_KEY]: marker});
};

// Called when the worker starts. If a marker survives with no trace in memory, the worker was unloaded
// mid-recording: the events collected since are gone and cannot be recovered, so the recording is
// closed out and the tab told to stop rather than left running against nothing.
export const recoverInterruptedTrace = async (): Promise<void> => {
  if (active) return;
  const raw: unknown = (await chrome.storage.session.get(ACTIVE_KEY))[ACTIVE_KEY];
  if (typeof raw !== 'object' || raw === null) return;

  const tabId = Reflect.get(raw, 'tabId');
  if (typeof tabId === 'number') {
    await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-stop'}).catch(() => undefined);
  }
  await chrome.alarms.clear(LIMIT_ALARM).catch(() => undefined);
  await chrome.storage.session.remove(ACTIVE_KEY);
};

// The alarm is the length limit. It fires even if the worker was unloaded in between, which a
// setTimeout would not.
export const onLimitAlarm = async (name: string): Promise<void> => {
  if (name !== LIMIT_ALARM) return;
  if (active) active.overran = true;
  await stopTrace();
};

const pageOf = async (tabId: number): Promise<Page> => {
  const tab = await chrome.tabs.get(tabId);
  return {
    url: tab.url ?? '',
    title: tab.title ?? '',
    // Replaced at stop with the value the page reported; chrome.tabs has no pixel ratio to give.
    viewport: {width: tab.width ?? 0, height: tab.height ?? 0, dpr: 1},
  };
};

const merge = (batches: readonly TraceBatch[]) => ({
  steps: batches.flatMap((batch) => batch.steps ?? []),
  console: batches.flatMap((batch) => batch.console ?? []),
  network: batches.flatMap((batch) => batch.network ?? []),
  state: batches.flatMap((batch) => batch.state ?? []),
  replay: batches.flatMap((batch) => batch.replay ?? []),
});

export const activeTraceTabId = (): number | null => active?.tabId ?? null;

// The traced tab closing ends the capture and leaves the recording with no way to finish itself; the
// trace recorded up to that point is still worth keeping, so it is closed out rather than stranded.
export const finishTraceForClosedTab = async (tabId: number): Promise<void> => {
  if (active?.tabId !== tabId) return;
  await stopTrace();
};

// How far into the trace a newly loaded document is joining, or null when nothing is recording there.
export const activeTraceElapsed = (tabId: number): number | null =>
  active && active.tabId === tabId ? Date.now() - active.startedAtMs : null;

export const traceStatus = (): TraceStatusMessage => {
  if (!active) return IDLE_STATUS;

  const merged = merge(active.batches);
  const live = active.cdp !== null && active.cdp.attached() ? active.cdp : null;
  const consoleEntries = live ? live.console : merged.console;
  const network = live ? live.network : merged.network;

  return {
    type: 'caliper/trace-status',
    recording: true,
    startedAt: active.startedAt,
    consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
    failedRequests: network.filter((entry) => entry.failed).length,
  };
};

// Only the tab being recorded may contribute. Without this any page in any other tab could post a
// batch of its own invention, and the fabricated steps would reach the agent as recorded fact.
export const ingestBatch = (batch: TraceBatch, tabId: number | undefined): void => {
  if (!active || tabId !== active.tabId) return;

  if (!active.stateStartSeen && batch.stateSnapshot !== undefined) {
    active.stateStart = batch.stateSnapshot;
    active.stateStartSeen = true;
  }
  if (batch.snapshotOnly === true) {
    active.stateEnd = batch.stateSnapshot;
    return;
  }
  if (typeof batch.dpr === 'number') active.dpr = batch.dpr;
  active.batches.push(batch);
};

export const startTrace = async (tabId: number, label: string): Promise<boolean> => {
  if (active) return false;

  const options = await readTraceOptions();
  const startedAtMs = Date.now();

  active = {
    id: crypto.randomUUID(),
    tabId,
    label,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    page: await pageOf(tabId),
    cdp: options.enableCdp ? await attachCdp(tabId, () => Date.now() - startedAtMs) : null,
    batches: [],
    stateStart: undefined,
    stateEnd: undefined,
    stateStartSeen: false,
    stopping: false,
    overran: false,
    dpr: 1,
  };

  markActive(active);
  // "Maximum trace length" used to bound only the encoder, so the trace itself — and the batches piling
  // up in this worker — grew without limit. It now stops the recording and says the trace was cut.
  await chrome.alarms.create(LIMIT_ALARM, {when: Date.now() + options.maxDurationMs});

  const videoOptions = {
    maxDurationMs: options.maxDurationMs,
    videoBitrate: options.videoBitrate,
  };

  // tabCapture is the better picture, but it needs the extension to have been invoked on this tab from
  // the toolbar and Chrome revokes that on navigation. When it is not available the already-attached
  // debugger session can screencast instead, so a trace only loses its video when neither is possible.
  // Sent before the capture setup, which takes long enough that a fast first click landed with the
  // buffers still closed — a network request with no step to explain it.
  await chrome.tabs
    .sendMessage(tabId, {type: 'caliper/collector-start', elapsedMs: Date.now() - startedAtMs})
    .catch(() => undefined);

  const captured = await startVideo(tabId, videoOptions);
  if (!captured && active.cdp) {
    const encoding = await startFrameVideo(videoOptions);
    if (encoding) await active.cdp.startScreencast(pushVideoFrame);
  }

  return true;
};

// Deliberately takes no tab: the background already knows which tab is recording, and requiring the
// panel to supply it made Stop a silent no-op whenever the panel was looking at a different tab.
export const stopTrace = async (): Promise<boolean> => {
  const current = active;
  if (!current || current.stopping) return false;
  current.stopping = true;

  await chrome.alarms.clear(LIMIT_ALARM).catch(() => undefined);

  const {tabId} = current;
  await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-stop'}).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, FINAL_FLUSH_GRACE_MS));
  active = null;
  markActive(null);

  // A session Chrome took away mid-trace holds only what arrived before that moment, while the in-page
  // collectors kept recording throughout. Preferring the truncated CDP arrays — and labelling them
  // `cdp` — would hand the agent a half-empty channel described as the trustworthy one. Probed before
  // the teardown below, since asking afterwards would always answer "dead".
  const cdp = current.cdp !== null && (await current.cdp.isLive()) ? current.cdp : null;

  await current.cdp?.detach();
  const video = await stopVideo();
  const options = await readTraceOptions();

  const merged = merge(current.batches);
  const base = `caliper-${current.id.slice(0, ID_LENGTH)}`;
  // Truncation is a property of the trace, not only of its video: a recording that overran its limit or
  // overflowed a collector buffer is incomplete however the video turned out.
  // Ordered by how much it costs the reader: a stopped recording loses the end of the reproduction, an
  // overflow loses the head of a channel, and a trimmed video loses nothing the trace itself carries.
  const truncatedBy = current.overran
    ? 'length-limit'
    : current.batches.some((batch) => batch.dropped === true)
      ? 'buffer-overflow'
      : video.truncated
        ? 'video-window'
        : null;
  const truncated = truncatedBy !== null;
  const sources: TraceSources = {
    network: cdp ? 'cdp' : 'fallback',
    console: cdp ? 'cdp' : 'fallback',
    // The bridge is installed on every page; whether the app dispatched anything in the window is a
    // different question, and reporting 'none' for a quiet store told the agent something false about
    // the application.
    state: 'devtools-bridge',
  };

  const {trace, detail} = assembleTrace({
    id: current.id,
    label: current.label,
    startedAt: current.startedAt,
    durationMs: Date.now() - current.startedAtMs,
    truncated,
    truncatedBy,
    page: {...current.page, viewport: {...current.page.viewport, dpr: current.dpr}},
    sources,
    steps: merged.steps,
    console: cdp ? cdp.console : merged.console,
    network: cdp ? cdp.network : merged.network,
    state: merged.state,
    stateSnapshots: {start: current.stateStart, end: current.stateEnd},
    files: {
      trace: `${base}.trace.json`,
      replay: merged.replay.length > 0 ? `${base}.replay.ndjson.gz` : undefined,
      video: video.dataUrl ? `${base}.webm` : undefined,
    },
    redactSecrets: options.redactSecrets,
    maxStateDiffBytes: MAX_STATE_DIFF_BYTES,
  });

  await putBlob(`${current.id}:detail`, JSON.stringify(detail));
  if (merged.replay.length > 0) await putBlob(`${current.id}:replay`, merged.replay.join('\n'));
  if (video.dataUrl) await putBlob(`${current.id}:video`, video.dataUrl);

  await runOp({kind: 'pushTrace', trace});
  return true;
};
