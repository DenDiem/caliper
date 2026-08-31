const OFFSCREEN_PATH = 'offscreen.html';

export interface VideoOptions {
  maxDurationMs: number;
  videoBitrate: number;
}

export interface VideoResult {
  dataUrl: string | null;
  truncated: boolean;
}

const EMPTY: VideoResult = {dataUrl: null, truncated: false};

const ensureDocument = async (): Promise<void> => {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Encode the tab capture for a QA bug trace.',
  });
};

// A trace is still worth recording without its video: the agent reads the trace, and the video only
// serves the human. So a capture that cannot start is reported, never thrown.
export const startVideo = async (tabId: number, options: VideoOptions): Promise<boolean> => {
  try {
    await ensureDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tabId});
    const started: unknown = await chrome.runtime.sendMessage({
      type: 'caliper/offscreen-start',
      payload: {streamId, ...options},
    });
    if (started !== true) console.warn('[caliper] tab capture did not start');
    return started === true;
  } catch (error) {
    // A trace without video is still a usable trace, so this never throws — but the reason belongs in
    // the service-worker log rather than nowhere.
    console.warn('[caliper] tab capture unavailable', error);
    return false;
  }
};

export const stopVideo = async (): Promise<VideoResult> => {
  try {
    if (!(await chrome.offscreen.hasDocument())) return EMPTY;
    const result: unknown = await chrome.runtime.sendMessage({type: 'caliper/offscreen-stop'});
    await chrome.offscreen.closeDocument().catch(() => undefined);

    if (typeof result === 'object' && result !== null && 'dataUrl' in result) {
      const dataUrl = Reflect.get(result, 'dataUrl');
      const truncated = Reflect.get(result, 'truncated');
      return {
        dataUrl: typeof dataUrl === 'string' ? dataUrl : null,
        truncated: truncated === true,
      };
    }
    return EMPTY;
  } catch {
    return EMPTY;
  }
};
