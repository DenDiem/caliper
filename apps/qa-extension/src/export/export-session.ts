import type {CaliperAnnotation, CaliperSession} from '@caliper/core';
import {screenshotFilename, toToon} from '@caliper/core';
import {gzipSync, zipSync} from 'fflate';
import {getBlob} from '../trace/blob-store';

export interface ExportOptions {
  withAssets: boolean;
}

const FOLDER_ID_LENGTH = 8;

export const exportSession = (session: CaliperSession, {withAssets}: ExportOptions): string => {
  const payload: CaliperSession = withAssets ? session : {...session, assets: {}};
  return JSON.stringify(payload, null, 2);
};

export const copyToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

const withScreenshotPath = (annotation: CaliperAnnotation): CaliperAnnotation =>
  annotation.screenshotId
    ? {...annotation, screenshot: `${annotation.screenshotId}.png`}
    : annotation;

const toBytes = async (dataUrl: string): Promise<Uint8Array> => {
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
};

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

interface TraceFileEntry {
  filename: string;
  bytes: Uint8Array;
}

// The three artifacts a trace publishes: the detail file is the agent's, the replay is its zoom-in
// source, the video is the human's. They travel as siblings and are never inlined into the manifest —
// a WebM inside a JSON asset map is exactly what the file layout exists to avoid.
export const traceFileEntries = async (session: CaliperSession): Promise<TraceFileEntry[]> => {
  const entries: TraceFileEntry[] = [];

  for (const trace of session.traces) {
    const detail = await getBlob(`${trace.id}:detail`);
    if (detail) entries.push({filename: trace.files.trace, bytes: encode(detail)});

    if (trace.files.replay) {
      const replay = await getBlob(`${trace.id}:replay`);
      if (replay) entries.push({filename: trace.files.replay, bytes: gzipSync(encode(replay))});
    }

    if (trace.files.video) {
      const video = await getBlob(`${trace.id}:video`);
      if (video) entries.push({filename: trace.files.video, bytes: await toBytes(video)});
    }
  }

  return entries;
};

export const downloadSessionArchive = async (session: CaliperSession): Promise<void> => {
  const folder = `caliper-${session.id.slice(0, FOLDER_ID_LENGTH)}`;
  const files: Record<string, Uint8Array> = {};

  for (const annotation of session.annotations) {
    const {screenshotId} = annotation;
    if (!screenshotId) continue;

    const dataUrl = session.assets[screenshotId];
    if (!dataUrl) continue;

    files[`${screenshotId}.png`] = await toBytes(dataUrl);
  }

  const manifest: CaliperSession = {
    ...session,
    annotations: session.annotations.map(withScreenshotPath),
    assets: {},
  };

  for (const entry of await traceFileEntries(session)) {
    files[entry.filename] = entry.bytes;
  }

  files['session.json'] = encode(JSON.stringify(manifest, null, 2));
  files['session.toon'] = encode(toToon(session));

  const archive = zipSync({[folder]: files});
  const url = URL.createObjectURL(new Blob([archive], {type: 'application/zip'}));

  await chrome.downloads.download({url, filename: `${folder}.zip`, saveAs: false});
};

const toJiraAnnotation = (
  annotation: CaliperAnnotation,
  index: number,
  session: CaliperSession,
): CaliperAnnotation => {
  const dataUrl = annotation.screenshotId ? session.assets[annotation.screenshotId] : undefined;
  const copy: CaliperAnnotation = {...annotation};
  delete copy.screenshotId;
  if (dataUrl) copy.screenshot = screenshotFilename(index, annotation);
  else delete copy.screenshot;
  return copy;
};

// The machine-readable session Caliper attaches to a Jira issue so an agent can reconstruct the review
// offline (`caliper pull`). Screenshots are referenced by their attachment filename — the same PNGs
// uploadScreenshots already attaches — and screenshotId/assets are dropped: the id would dangle into an
// empty asset map, and its mere presence triggers toToon's extension-only "use Download" help line on the
// read side, which is wrong once the PNGs are materialised to disk.
export const buildJiraManifest = (session: CaliperSession): string => {
  const manifest: CaliperSession = {
    ...session,
    annotations: session.annotations.map((annotation, index) => toJiraAnnotation(annotation, index, session)),
    assets: {},
  };
  return JSON.stringify(manifest, null, 2);
};
