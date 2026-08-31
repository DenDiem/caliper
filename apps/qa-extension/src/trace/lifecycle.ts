import type {Page, TraceSources} from '@caliper/core';
import {assembleTrace} from '@caliper/recorder';
import type {TraceBatch, TraceStatusMessage} from '../messaging/messages';
import {runOp} from '../sinks/store';
import {attachCdp, type CdpCollector} from './cdp';
import {putBlob} from './blob-store';
import {readTraceOptions} from './options';
import {startVideo, stopVideo} from './video';

const ID_LENGTH = 8;
const MAX_STATE_DIFF_BYTES = 2048;

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
  stateStartSeen: boolean;
}

let active: ActiveTrace | null = null;

const pageOf = async (tabId: number): Promise<Page> => {
  const tab = await chrome.tabs.get(tabId);
  return {
    url: tab.url ?? '',
    title: tab.title ?? '',
    viewport: {width: tab.width ?? 0, height: tab.height ?? 0, dpr: 1},
  };
};

const merge = (batches: readonly TraceBatch[]) => ({
  steps: batches.flatMap((batch) => batch.steps),
  console: batches.flatMap((batch) => batch.console),
  network: batches.flatMap((batch) => batch.network),
  state: batches.flatMap((batch) => batch.state),
  replay: batches.flatMap((batch) => batch.replay),
});

export const activeTraceTabId = (): number | null => active?.tabId ?? null;

export const traceStatus = (): TraceStatusMessage => {
  if (!active) return IDLE_STATUS;

  const merged = merge(active.batches);
  const consoleEntries = active.cdp ? active.cdp.console : merged.console;
  const network = active.cdp ? active.cdp.network : merged.network;

  return {
    type: 'caliper/trace-status',
    recording: true,
    startedAt: active.startedAt,
    consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
    failedRequests: network.filter((entry) => entry.failed).length,
  };
};

export const ingestBatch = (batch: TraceBatch): void => {
  if (!active) return;
  if (!active.stateStartSeen && batch.stateSnapshot !== undefined) {
    active.stateStart = batch.stateSnapshot;
    active.stateStartSeen = true;
  }
  active.batches.push(batch);
};

export const startTrace = async (tabId: number, label: string): Promise<void> => {
  if (active) return;

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
    stateStartSeen: false,
  };

  await startVideo(tabId, {
    maxDurationMs: options.maxDurationMs,
    videoBitrate: options.videoBitrate,
  });
  await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-start'}).catch(() => undefined);
};

export const stopTrace = async (tabId: number): Promise<void> => {
  const current = active;
  if (!current || current.tabId !== tabId) return;
  active = null;

  await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-stop'}).catch(() => undefined);
  await current.cdp?.detach();
  const video = await stopVideo();
  const options = await readTraceOptions();

  const merged = merge(current.batches);
  const base = `caliper-${current.id.slice(0, ID_LENGTH)}`;
  const sources: TraceSources = {
    network: current.cdp ? 'cdp' : 'fallback',
    console: current.cdp ? 'cdp' : 'fallback',
    state: merged.state.length > 0 ? 'devtools-bridge' : 'none',
  };

  const {trace, detail} = assembleTrace({
    id: current.id,
    label: current.label,
    startedAt: current.startedAt,
    durationMs: Date.now() - current.startedAtMs,
    truncated: video.truncated,
    page: current.page,
    sources,
    steps: merged.steps,
    console: current.cdp ? current.cdp.console : merged.console,
    network: current.cdp ? current.cdp.network : merged.network,
    state: merged.state,
    stateSnapshots: {
      start: current.stateStart,
      end: current.batches[current.batches.length - 1]?.stateSnapshot,
    },
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
};
