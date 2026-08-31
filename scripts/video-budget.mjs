/**
 * Measures the encoder settings the trace recorder uses (VP9, <=1280px, <=12 fps, 250 kbps) against a
 * 30-second recording, so the ~1 MB budget is a number and not an assumption.
 *
 * It encodes a synthetic UI-like animation rather than a captured tab: chrome.tabCapture needs the
 * extension to have been invoked from the toolbar, which automation cannot do. The codec, constraints
 * and bitrate are identical to apps/qa-extension/src/entrypoints/offscreen/main.ts, which is what the
 * budget depends on.
 *
 * Usage: node scripts/video-budget.mjs [seconds]
 */
import {createRequire} from 'node:module';
import {existsSync, mkdtempSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require = createRequire(import.meta.url);
const SECONDS = Number(process.argv[2] ?? 30);

const loadPlaywright = () => {
  for (const candidate of [
    'playwright',
    'C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright',
  ]) {
    try {
      return require(candidate);
    } catch {
      continue;
    }
  }
  throw new Error('playwright not found');
};

const findChromium = () => {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return null;
  const build = readdirSync(root)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .pop();
  const exe = build ? join(root, build, 'chrome-win64/chrome.exe') : null;
  return exe && existsSync(exe) ? exe : null;
};

const {chromium} = loadPlaywright();
const executablePath = findChromium();

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'budget-')), {
  headless: false,
  ...(executablePath ? {executablePath} : {channel: 'chrome'}),
  viewport: {width: 1280, height: 800},
});

const page = await context.newPage();
await page.goto('http://127.0.0.1:5599/checkout');

const result = await page.evaluate(async (seconds) => {
  const PREFERRED = 'video/webm;codecs=vp9';
  const FALLBACK = 'video/webm;codecs=vp8';
  const mimeType = MediaRecorder.isTypeSupported(PREFERRED) ? PREFERRED : FALLBACK;

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 800;
  const context2d = canvas.getContext('2d');

  // A static page with a moving cursor and an occasional repaint: the shape of a QA reproduction, and
  // the shape VP9 compresses well. A noise field would measure a case this recorder never sees.
  let frame = 0;
  const draw = () => {
    frame += 1;
    context2d.fillStyle = '#f6f7f9';
    context2d.fillRect(0, 0, 1280, 800);
    context2d.fillStyle = '#ffffff';
    context2d.fillRect(120, 80, 1040, 620);
    context2d.fillStyle = '#0a56f0';
    context2d.fillRect(160, 620, 180, 44);
    context2d.fillStyle = '#141a21';
    context2d.font = '20px sans-serif';
    context2d.fillText('Checkout', 160, 140);
    context2d.fillText(`frame ${frame}`, 160, 180);
    context2d.beginPath();
    context2d.arc(400 + Math.sin(frame / 8) * 220, 400 + Math.cos(frame / 11) * 120, 7, 0, Math.PI * 2);
    context2d.fill();
  };

  const timer = setInterval(draw, 1000 / 12);
  const stream = canvas.captureStream(12);
  const chunks = [];
  const recorder = new MediaRecorder(stream, {mimeType, videoBitsPerSecond: 250_000});
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  recorder.stop();
  await stopped;
  clearInterval(timer);

  const blob = new Blob(chunks, {type: mimeType});
  return {mimeType, bytes: blob.size, chunks: chunks.length};
}, SECONDS);

const kb = result.bytes / 1024;
console.log(`codec        : ${result.mimeType}`);
console.log(`duration     : ${SECONDS}s (${result.chunks} one-second chunks)`);
console.log(`size         : ${kb.toFixed(0)} KB`);
console.log(`per 30s      : ${((kb / SECONDS) * 30).toFixed(0)} KB`);
console.log(`budget (1 MB): ${(kb / SECONDS) * 30 <= 1024 ? 'MET' : 'EXCEEDED'}`);

await context.close();
