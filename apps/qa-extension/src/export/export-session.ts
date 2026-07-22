import type {CaliperAnnotation, CaliperSession} from '@caliper/core';
import {toToon} from '@caliper/core';
import {zipSync} from 'fflate';

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

  files['session.json'] = encode(JSON.stringify(manifest, null, 2));
  files['session.toon'] = encode(toToon(session));

  const archive = zipSync({[folder]: files});
  const url = URL.createObjectURL(new Blob([archive], {type: 'application/zip'}));

  await chrome.downloads.download({url, filename: `${folder}.zip`, saveAs: false});
};
