import type {CaliperAnnotation, CaliperSession} from '@caliper/core';

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

const toBlobUrl = async (dataUrl: string): Promise<string> => {
  const response = await fetch(dataUrl);
  return URL.createObjectURL(await response.blob());
};

const withScreenshotPath = (annotation: CaliperAnnotation): CaliperAnnotation =>
  annotation.screenshotId
    ? {...annotation, screenshot: `${annotation.screenshotId}.png`}
    : annotation;

export const downloadSessionBundle = async (session: CaliperSession): Promise<void> => {
  const folder = `caliper-${session.id.slice(0, FOLDER_ID_LENGTH)}`;

  for (const annotation of session.annotations) {
    const dataUrl = annotation.screenshotId
      ? session.assets[annotation.screenshotId]
      : undefined;
    if (!dataUrl || !annotation.screenshotId) continue;

    await chrome.downloads.download({
      url: await toBlobUrl(dataUrl),
      filename: `${folder}/${annotation.screenshotId}.png`,
      saveAs: false,
    });
  }

  const manifest: CaliperSession = {
    ...session,
    annotations: session.annotations.map(withScreenshotPath),
    assets: {},
  };

  await chrome.downloads.download({
    url: URL.createObjectURL(
      new Blob([JSON.stringify(manifest, null, 2)], {type: 'application/json'}),
    ),
    filename: `${folder}/session.json`,
    saveAs: false,
  });
};
