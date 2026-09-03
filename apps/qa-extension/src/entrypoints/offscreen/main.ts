const MAX_WIDTH = 1280;
const MAX_FPS = 12;
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 800;
const CHUNK_MS = 1000;
// Ordered by preference within each container. MP4 is tried first when it is asked for, but WebM
// always follows as a fallback: Chrome only learned to encode MP4 in MediaRecorder recently, and a
// recording that fails to start is worse than one in the less convenient container.
const MP4_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'];
const WEBM_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
const LAST_RESORT = 'video/webm';

interface StartPayload {
  streamId?: string;
  maxDurationMs: number;
  videoBitrate: number;
  videoFormat?: string;
}

export interface VideoResult {
  dataUrl: string | null;
  truncated: boolean;
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let maxChunks = 0;
let truncated = false;
let frameCanvas: HTMLCanvasElement | null = null;
let frameTrack: CanvasCaptureMediaStreamTrack | null = null;
// Held for the life of a recording so the Blob is labelled with the type the recorder actually used,
// not with a preference the browser may have declined.
let activeMime = '';

const isCanvasTrack = (track: MediaStreamTrack): track is CanvasCaptureMediaStreamTrack =>
  'requestFrame' in track;

const mimeType = (format?: string): string => {
  const wanted = format === 'webm' ? WEBM_TYPES : [...MP4_TYPES, ...WEBM_TYPES];
  return wanted.find((type) => MediaRecorder.isTypeSupported(type)) ?? LAST_RESORT;
};

const isStartPayload = (value: unknown): value is StartPayload =>
  typeof value === 'object' &&
  value !== null &&
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

const start = async ({streamId, maxDurationMs, videoBitrate, videoFormat}: StartPayload): Promise<void> => {
  if (!streamId) throw new Error('tab capture needs a stream id');
  // Two starts would orphan the first recorder and interleave both sources into one blob.
  if (recorder) throw new Error('a recording is already running');
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
  activeMime = mimeType(videoFormat);

  recorder = new MediaRecorder(stream, {mimeType: activeMime, videoBitsPerSecond: videoBitrate});
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

// The screencast path: frames arrive one at a time from the debugger session, so the canvas track is
// created at rate 0 and each frame is pushed explicitly. That keeps the encoded timeline matched to the
// frames that actually arrived instead of inventing a clock.
const startFrames = ({maxDurationMs, videoBitrate, videoFormat}: StartPayload): boolean => {
  if (recorder) return false;

  frameCanvas = document.createElement('canvas');
  frameCanvas.width = FRAME_WIDTH;
  frameCanvas.height = FRAME_HEIGHT;

  const stream = frameCanvas.captureStream(0);
  const [track] = stream.getVideoTracks();
  frameTrack = track && isCanvasTrack(track) ? track : null;

  chunks = [];
  truncated = false;
  maxChunks = Math.max(1, Math.ceil(maxDurationMs / CHUNK_MS));
  activeMime = mimeType(videoFormat);

  recorder = new MediaRecorder(stream, {mimeType: activeMime, videoBitsPerSecond: videoBitrate});
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    if (chunks.length > maxChunks) {
      chunks = chunks.slice(chunks.length - maxChunks);
      truncated = true;
    }
  };
  recorder.start(CHUNK_MS);
  return true;
};

const finalise = (active: MediaRecorder, resolve: (result: VideoResult) => void): void => {
  for (const track of active.stream.getTracks()) track.stop();
  const blob = new Blob(chunks, {type: activeMime});
  recorder = null;
  chunks = [];
  frameCanvas = null;
  frameTrack = null;

  const reader = new FileReader();
  reader.onload = () => resolve({dataUrl: String(reader.result), truncated});
  reader.onerror = () => resolve({dataUrl: null, truncated});
  reader.readAsDataURL(blob);
};

const pushFrame = async (dataUrl: string): Promise<void> => {
  const canvas = frameCanvas;
  const track = frameTrack;
  if (!canvas || !track) return;

  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const context = canvas.getContext('2d');
  if (!context) return;

  const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  bitmap.close();

  track.requestFrame();
};

const stop = (): Promise<VideoResult> =>
  new Promise((resolve) => {
    const active = recorder;
    if (!active) {
      resolve({dataUrl: null, truncated: false});
      return;
    }
    // The capture ends on its own when the traced tab closes, so by the time Stop arrives the recorder
    // may already be inactive: assigning onstop would then wait for an event that has been and gone,
    // and calling stop() throws. Take what was captured instead of hanging the caller.
    if (active.state === 'inactive') {
      finalise(active, resolve);
      return;
    }
    active.onstop = () => finalise(active, resolve);
    try {
      active.stop();
    } catch {
      finalise(active, resolve);
    }
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

  if (type === 'caliper/offscreen-start-frames') {
    const payload = Reflect.get(message, 'payload');
    if (!isStartPayload(payload)) {
      sendResponse(false);
      return true;
    }
    sendResponse(startFrames(payload));
    return true;
  }

  if (type === 'caliper/offscreen-frame') {
    const dataUrl = Reflect.get(message, 'dataUrl');
    if (typeof dataUrl === 'string') void pushFrame(dataUrl);
    sendResponse(true);
    return true;
  }

  if (type === 'caliper/offscreen-stop') {
    void stop().then(sendResponse);
    return true;
  }

  return false;
});
