import type {Box} from '@caliper/core';

const PADDING = 16;

export const captureElement = async (box: Box, dpr: number): Promise<string | null> => {
  const dataUrl = await chrome.tabs.captureVisibleTab({format: 'png'});
  if (!dataUrl) return null;

  const response = await fetch(dataUrl);
  const bitmap = await createImageBitmap(await response.blob());

  const sx = Math.max(0, (box.x - PADDING) * dpr);
  const sy = Math.max(0, (box.y - PADDING) * dpr);
  const sw = Math.min(bitmap.width - sx, (box.width + PADDING * 2) * dpr);
  const sh = Math.min(bitmap.height - sy, (box.height + PADDING * 2) * dpr);

  if (sw <= 0 || sh <= 0) return null;

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({type: 'image/png'});

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};
