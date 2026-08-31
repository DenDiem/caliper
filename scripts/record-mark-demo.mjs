/**
 * Re-records the mark-a-defect demo GIF: the picker marking real elements, then the side panel that
 * holds the result.
 *
 * The panel half is recorded from the real sidepanel page against the real stored session — the same
 * component the docked panel renders. Chrome's side panel is browser chrome and cannot be captured by
 * page video, which is why it is framed on its own rather than shown docked.
 *
 * Needs the demo server running and the extension built.
 * Usage: node scripts/record-mark-demo.mjs [--keep]
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
const OUT = join(REPO, 'docs/media/qa-extension/mark-defect.gif');
const DEMO = 'http://127.0.0.1:5599/';

const WIDTH = 1280;
const HEIGHT = 800;
const PANEL_WIDTH = 430;
const FPS = 12;
// The GIF is scaled down on the way out: a README stalls on a slow connection long before it runs out
// of pixels, and docs/media/README.md puts the ceiling at ~5 MB.
const OUT_WIDTH = 1060;
const PANEL_GROUND = '0x0b0f14';

const DEFECTS = [
  {
    ref: 'z-badge',
    comment: 'Badge relies on colour alone — add a checkmark icon for accessibility',
    severity: 'minor',
  },
  {
    ref: 'z-cta-phone',
    comment: 'Phone number shows placeholder digits instead of the real one',
    severity: 'blocker',
  },
];

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

const typeInto = async (page, selector, text) => {
  await page.click(selector);
  for (const chunk of text.match(/.{1,3}/g) ?? []) {
    await page.type(selector, chunk, {delay: 0});
    await wait(38);
  }
};

const main = async () => {
  if (!existsSync(EXTENSION)) throw new Error('build the extension first');
  await fetch(DEMO).catch(() => {
    throw new Error('Demo server not reachable. Run: pnpm --filter @dendiem/caliper demo');
  });

  const {chromium} = loadPlaywright();
  const executablePath = findChromium();
  const stage = mkdtempSync(join(tmpdir(), 'caliper-mark-'));
  const profile = join(stage, 'profile');

  const launch = (recordDir, size) =>
    chromium.launchPersistentContext(profile, {
      headless: false,
      ...(executablePath ? {executablePath} : {channel: 'chrome'}),
      viewport: size,
      // The panel leads dark in the design system; left on the host default it records light and the
      // two README GIFs disagree with each other.
      colorScheme: 'dark',
      recordVideo: {dir: recordDir, size},
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

  // ---- clip A: marking on the live page ----
  const context = await launch(join(stage, 'clip-a'), {width: WIDTH, height: HEIGHT});
  const page = await context.newPage();
  await page.goto(DEMO, {waitUntil: 'domcontentloaded'});

  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', {timeout: 20_000}));
  const extensionId = new URL(worker.url()).host;
  const tabId = await worker.evaluate(
    async ([url]) => (await chrome.tabs.query({url}))[0].id,
    ['http://127.0.0.1:5599/*'],
  );

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.bringToFront();

  // Mark mode, the same message the panel's mode switch sends.
  await panel.evaluate(
    ([id]) => chrome.runtime.sendMessage({type: 'caliper/set-mode-tab', tabId: id, armed: true}),
    [tabId],
  );
  await wait(1200);

  for (const defect of DEFECTS) {
    const target = `[data-caliper-ref="${defect.ref}"]`;
    // A pass over neighbouring elements first: the highlight following the cursor is the thing worth
    // showing, and a demo that jumps straight to a click never shows it.
    await page.hover('[data-caliper-ref="z-price"]').catch(() => undefined);
    await wait(500);
    await page.hover(target);
    await wait(700);
    await page.click(target);
    await wait(700);

    await typeInto(page, '.caliper-pop__text', defect.comment);
    await wait(400);
    await page.click(`.caliper-pop__sev button:has-text("${defect.severity}")`).catch(() => undefined);
    await wait(400);
    await page.click('.caliper-pop__foot button:has-text("Save defect")');
    await wait(900);
  }

  await wait(800);
  const clipAPath = await page.video().path();
  await page.close();
  await panel.close();
  await context.close();

  // ---- clip B: the side panel holding what was just marked ----
  const second = await launch(join(stage, 'clip-b'), {width: PANEL_WIDTH, height: HEIGHT});
  const panelPage = await second.newPage();
  const worker2 =
    second.serviceWorkers()[0] ?? (await second.waitForEvent('serviceworker', {timeout: 20_000}));
  await panelPage.goto(`chrome-extension://${new URL(worker2.url()).host}/sidepanel.html`);
  await wait(3600);
  const clipBPath = await panelPage.video().path();
  await panelPage.close();
  await second.close();

  // ---- stitch, two passes so the dark panel does not band ----
  const palette = join(stage, 'palette.png');
  const filter =
    `[0:v]fps=${FPS},scale=${OUT_WIDTH}:-1:flags=lanczos,setsar=1[a];` +
    `[1:v]fps=${FPS},scale=-1:${Math.round((HEIGHT * OUT_WIDTH) / WIDTH)}:flags=lanczos,` +
    `pad=${OUT_WIDTH}:${Math.round((HEIGHT * OUT_WIDTH) / WIDTH)}:(ow-iw)/2:0:${PANEL_GROUND},setsar=1[b];` +
    `[a][b]concat=n=2:v=1[v]`;

  execFileSync(
    'ffmpeg',
    ['-y', '-i', clipAPath, '-i', clipBPath, '-filter_complex', `${filter};[v]palettegen=stats_mode=diff[p]`, '-map', '[p]', palette],
    {stdio: 'ignore'},
  );
  mkdirSync(join(REPO, 'docs/media/qa-extension'), {recursive: true});
  execFileSync(
    'ffmpeg',
    ['-y', '-i', clipAPath, '-i', clipBPath, '-i', palette, '-filter_complex', `${filter};[v][2:v]paletteuse=dither=bayer:bayer_scale=3`, OUT],
    {stdio: 'ignore'},
  );

  console.log(`wrote ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
  if (!process.argv.includes('--keep')) rmSync(stage, {recursive: true, force: true});
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
