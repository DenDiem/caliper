/**
 * Captures the four 1280x800 Chrome Web Store screenshots the listing needs.
 *
 * The store rejects GIFs and wants exactly 1280x800 or 640x400, so these are stills rather than frames
 * pulled from the demo recordings. Chrome's side panel is browser chrome and page video cannot see it,
 * so the two panel shots are composed: the app on the left, the real sidepanel page on the right, which
 * is how the product actually looks when docked.
 *
 * Needs the demo server running and the extension built.
 * Usage: node scripts/record-store-shots.mjs
 */
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EXTENSION = join(REPO, 'apps/qa-extension/.output/chrome-mv3');
const OUT_DIR = join(REPO, 'docs/media/store');
const DEMO_ORIGIN = 'http://127.0.0.1:5599';

const WIDTH = 1280;
const HEIGHT = 800;
const PANEL_WIDTH = 420;
const PAGE_WIDTH = WIDTH - PANEL_WIDTH;

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
  throw new Error('playwright not found. Install @playwright/cli globally.');
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Page and panel are captured separately and joined, because the docked panel is browser chrome.
const compose = (pageShot, panelShot, out) => {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i', pageShot,
      '-i', panelShot,
      '-filter_complex',
      `[0:v]scale=${PAGE_WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${PAGE_WIDTH}:${HEIGHT}[a];` +
        `[1:v]scale=${PANEL_WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${PANEL_WIDTH}:${HEIGHT}[b];` +
        `[a][b]hstack=inputs=2`,
      out,
    ],
    {stdio: 'ignore'},
  );
};

const main = async () => {
  if (!existsSync(EXTENSION)) throw new Error('build the extension first');
  await fetch(`${DEMO_ORIGIN}/api/orders`, {method: 'DELETE'}).catch(() => {
    throw new Error('Demo server not reachable. Run: pnpm --filter @dendiem/caliper demo');
  });

  const {chromium} = loadPlaywright();
  const executablePath = findChromium();
  const stage = mkdtempSync(join(tmpdir(), 'caliper-shots-'));
  mkdirSync(OUT_DIR, {recursive: true});

  const context = await chromium.launchPersistentContext(join(stage, 'profile'), {
    headless: false,
    ...(executablePath ? {executablePath} : {channel: 'chrome'}),
    viewport: {width: WIDTH, height: HEIGHT},
    colorScheme: 'dark',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const page = await context.newPage();
  await page.goto(`${DEMO_ORIGIN}/`, {waitUntil: 'domcontentloaded'});

  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', {timeout: 20_000}));
  const extensionId = new URL(worker.url()).host;
  const tabId = await worker.evaluate(
    async ([url]) => (await chrome.tabs.query({url}))[0].id,
    [`${DEMO_ORIGIN}/*`],
  );

  const panel = await context.newPage();
  await panel.setViewportSize({width: PANEL_WIDTH, height: HEIGHT});
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.bringToFront();

  const send = (message) => panel.evaluate((payload) => chrome.runtime.sendMessage(payload), message);

  // ---- 1. the picker armed, highlight following the cursor ----
  await send({type: 'caliper/set-mode-tab', tabId, armed: true});
  await wait(1200);
  await page.hover('[data-caliper-ref="z-cta-phone"]');
  await wait(600);
  await page.screenshot({path: join(OUT_DIR, 'store-1-picker-armed.png')});

  // ---- 2. the popover open on that element ----
  await page.click('[data-caliper-ref="z-cta-phone"]');
  await wait(700);
  await page.fill('.caliper-pop__text', 'Phone number shows placeholder digits instead of the real one');
  await wait(500);
  await page.screenshot({path: join(OUT_DIR, 'store-2-popover.png')});
  await page.click('.caliper-pop__foot button:has-text("Save defect")');
  await wait(900);

  // ---- 3. mid-recording: the strip with its timer and live counts ----
  // The marked defect is cleared first so the trace shots carry one subject each. Its thumbnail is also
  // a placeholder here — captureVisibleTab has no crop to make when the panel page holds focus — and a
  // hatched square in a store screenshot reads as a broken feature.
  await send({type: 'caliper/store-op', op: {kind: 'clear'}});
  await wait(600);

  await page.goto(`${DEMO_ORIGIN}/checkout`, {waitUntil: 'domcontentloaded'});
  await wait(700);
  await send({type: 'caliper/trace-start', tabId, label: 'Place order fails on the second submit'});
  await wait(1400);
  await page.click('#place-order');
  await wait(1500);
  await page.fill('#quantity', '2');
  await page.click('#place-order');
  await wait(1600);

  const midPage = join(stage, 'mid-page.png');
  const midPanel = join(stage, 'mid-panel.png');
  await page.screenshot({path: midPage});
  await panel.screenshot({path: midPanel});
  compose(midPage, midPanel, join(OUT_DIR, 'store-3-recording.png'));

  // ---- 4. the finished trace card ----
  await send({type: 'caliper/trace-stop'});
  await wait(3200);

  const donePage = join(stage, 'done-page.png');
  const donePanel = join(stage, 'done-panel.png');
  await page.screenshot({path: donePage});
  await panel.screenshot({path: donePanel});
  compose(donePage, donePanel, join(OUT_DIR, 'store-4-trace-card.png'));

  await context.close();

  for (const name of readdirSync(OUT_DIR).filter((file) => file.startsWith('store-'))) {
    const path = join(OUT_DIR, name);
    const size = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
      {encoding: 'utf8'},
    ).trim();
    console.log(`${name.padEnd(28)} ${size}  ${(statSync(path).size / 1024).toFixed(0)} KB`);
  }

  rmSync(stage, {recursive: true, force: true});
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
