const MAX_WIDTH = 1280;
const MAX_FPS = 12;
const CHUNK_MS = 1000;
const PREFERRED = 'video/webm;codecs=vp9';
const FALLBACK = 'video/webm;codecs=vp8';

interface StartPayload {
  streamId: string;
  maxDurationMs: number;
  videoBitrate: number;
}

export interface VideoResult {
  dataUrl: string | null;
  truncated: boolean;
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let maxChunks = 0;
let truncated = false;

const mimeType = (): string => (MediaRecorder.isTypeSupported(PREFERRED) ? PREFERRED : FALLBACK);

const isStartPayload = (value: unknown): value is StartPayload =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'streamId') === 'string' &&
  typeof Reflect.get(value, 'maxDurationMs') === 'number' &&
  typeof Reflect.get(value, 'videoBitrate') === 'number';

// Tab capture predates the standard constraints and is still requested through the legacy `mandatory`
// bag, which the DOM types do not describe. Declaring it is honest about that; casting the whole
// constraints object would hide any other mistake in it.
declare global {
  interface MediaTrackConstraintSet {
    mandatory?: {chromeMediaSource: 'tab'; chromeMediaSourceId: string};
  }
}

const tabConstraints = (streamId: string): MediaStreamConstraints => ({
  video: {mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: streamId}},
});

const start = async ({streamId, maxDurationMs, videoBitrate}: StartPayload): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia(tabConstraints(streamId));

  // The budget is met at the encoder, not afterwards: MV3 has no cheap transcoder, so the stream is
  // constrained before MediaRecorder ever sees it.
  const [track] = stream.getVideoTracks();
  await track
    .applyConstraints({width: {max: MAX_WIDTH}, frameRate: {max: MAX_FPS}})
    .catch(() => undefined);

  chunks = [];
  truncated = false;
  maxChunks = Math.max(1, Math.ceil(maxDurationMs / CHUNK_MS));

  recorder = new MediaRecorder(stream, {mimeType: mimeType(), videoBitsPerSecond: videoBitrate});
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    // A forgotten recording drops its oldest seconds rather than growing without limit. Dropping the
    // head of a WebM leaves the remainder unplayable in some players, which is why the trace says so.
    if (chunks.length > maxChunks) {
      chunks = chunks.slice(chunks.length - maxChunks);
      truncated = true;
    }
  };
  recorder.start(CHUNK_MS);
};

const stop = (): Promise<VideoResult> =>
  new Promise((resolve) => {
    const active = recorder;
    if (!active) {
      resolve({dataUrl: null, truncated: false});
      return;
    }
    active.onstop = () => {
      for (const track of active.stream.getTracks()) track.stop();
      const blob = new Blob(chunks, {type: mimeType()});
      recorder = null;
      chunks = [];

      const reader = new FileReader();
      reader.onload = () => resolve({dataUrl: String(reader.result), truncated});
      reader.onerror = () => resolve({dataUrl: null, truncated});
      reader.readAsDataURL(blob);
    };
    active.stop();
  });

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) return false;
  const type = Reflect.get(message, 'type');

  if (type === 'caliper/offscreen-start') {
    const payload = Reflect.get(message, 'payload');
    if (!isStartPayload(payload)) {
      sendResponse(false);
      return true;
    }
    void start(payload)
      .then(() => sendResponse(true))
      .catch(() => sendResponse(false));
    return true;
  }

  if (type === 'caliper/offscreen-stop') {
    void stop().then(sendResponse);
    return true;
  }

  return false;
});
