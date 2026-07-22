import type {CaliperSession} from '@caliper/core';

export interface ExportOptions {
  withAssets: boolean;
}

export const exportSession = (session: CaliperSession, {withAssets}: ExportOptions): string => {
  const payload: CaliperSession = withAssets ? session : {...session, assets: {}};
  return JSON.stringify(payload, null, 2);
};

export const copyToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

export const downloadJson = (text: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
