/**
 * Drives the built extension in a real Chromium and records one bug trace end to end.
 *
 * This is the verification unit tests cannot do: the main-world collector, the Redux devtools bridge,
 * chrome.debugger and the trace lifecycle only exist inside a loaded MV3 extension, and one of the bugs
 * this script found — a non-UTF-8 byte in the bundle that made Chrome refuse the whole extension — was
 * invisible to every build and test in the repo.
 *
 * Needs the demo server running: `pnpm --filter @dendiem/caliper demo`.
 * Usage: node scripts/trace-smoke.mjs [--no-cdp] [--save-video]
 *
 * `--no-cdp` runs the same reproduction with the debugger collector turned off in the options — the
 * supported setting, and the same path a tab with DevTools already open falls onto. Both modes are
 * worth running: they assert different things.
 *
 * Branded Chrome refuses --load-extension, so this points at the plain Chromium Playwright caches.
 * Playwright is not a dependency of this repo — it is resolved from a global @playwright/cli install.
 */
import {createRequire} from 'node:module';
import {existsSync, mkdtempSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EXTENSION = join(REPO, 'apps/qa-extension/.output/chrome-mv3');
const DEMO_ORIGIN = 'http://127.0.0.1:5599';
const DEMO = `${DEMO_ORIGIN}/checkout`;

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



const checks = [];
const check = (name, ok, detail) => {
  checks.push({name, ok});
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const main = async () => {
  if (!existsSync(EXTENSION)) {
    throw new Error(`No build at ${EXTENSION}. Run: pnpm --filter @caliper/qa-extension build`);
  }

  // The demo server keeps the "first order succeeds, the rest 409" state in memory, so a rerun needs it
  // back at zero or the first submit already fails and the reproduction is not the one being tested.
  await fetch(`${DEMO_ORIGIN}/api/orders`, {method: 'DELETE'}).catch(() => {
    throw new Error('Demo server not reachable. Run: pnpm --filter @dendiem/caliper demo');
  });

  const {chromium} = loadPlaywright();
  const executablePath = findChromium();
  // `--no-cdp` mirrors a real user setting rather than a contrived one: turning the debugger off in the
  // options is the supported way to get the in-page collectors, and it is the same code path a tab with
  // DevTools already open falls onto.
  const withDebugger = !process.argv.includes('--no-cdp');

  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'caliper-')), {
    headless: false,
    ...(executablePath ? {executablePath} : {channel: 'chrome'}),
    viewport: {width: 1280, height: 800},
    // Playwright puts --disable-extensions in its default args; left in place alongside --load-extension
    // the browser never finishes starting, so it has to be dropped rather than merely overridden.
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // The page has to come first: an MV3 service worker stays dormant until something wakes it, and what
  // wakes this one is the page bridge asking at document_start whether a trace is already running.
  const page = await context.newPage();
  await page.goto(DEMO, {waitUntil: 'domcontentloaded'});

  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', {timeout: 20_000}));
  const extensionId = new URL(worker.url()).host;
  console.log(`extension loaded: ${extensionId}`);
  console.log(`mode: ${withDebugger ? 'debugger attached (default)' : 'in-page fallback (--no-cdp)'}\n`);

  const world = await page.evaluate(() => ({
    devtoolsHook: typeof window.__REDUX_DEVTOOLS_EXTENSION__,
    fetchPatched: !String(window.fetch).includes('[native code]'),
  }));
  check('devtools hook installed before the app booted', world.devtoolsHook === 'object');
  check('fetch patched by the collector', world.fetchPatched);

  // Resolved by URL rather than "active tab": the persistent context opens its own about:blank first,
  // and that is what an active-tab query answers with here. The side panel has no such ambiguity.
  const tabId = await worker.evaluate(
    async ([url]) => (await chrome.tabs.query({url}))[0].id,
    [`${DEMO_ORIGIN}/*`],
  );

  // A service worker does not receive its own runtime.sendMessage, so Start and Stop are sent from an
  // extension page — the same message the side panel's record bar sends.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  if (!withDebugger) {
    await panel.evaluate(() =>
      chrome.storage.local.set({'caliper.traceOptions': {enableCdp: false}}),
    );
  }
  await page.bringToFront();
  await wait(400);

  const send = (message) => panel.evaluate((payload) => chrome.runtime.sendMessage(payload), message);

  await send({type: 'caliper/trace-start', tabId, label: 'Place order fails on the second submit'});
  await wait(1500);

  await page.click('#place-order');
  await wait(1400);
  await page.fill('#quantity', '2');
  await wait(500);
  await page.click('#place-order');
  await wait(1800);

  // Crossing a page load mid-trace: the collector is replaced, and its clock has to continue the
  // trace's rather than restart — otherwise late steps sort in front of the events that caused them.
  await page.goto(`${DEMO_ORIGIN}/`, {waitUntil: 'domcontentloaded'});
  await wait(1200);
  await page.click('[data-caliper-ref="z-badge"]').catch(() => undefined);
  await wait(1200);

  await send({type: 'caliper/trace-stop'});
  await wait(3000);

  const result = await worker.evaluate(async () => {
    const store = (await chrome.storage.local.get('caliper.store'))['caliper.store'];
    const session = store.sessions.find((item) => item.id === store.activeId);
    const trace = session.traces.at(-1);
    if (!trace) return {trace: null};

    const read = async (key) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('caliper-trace', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve) => {
        const get = db.transaction('blobs', 'readonly').objectStore('blobs').get(key);
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => resolve(undefined);
      });
    };

    const detail = await read(`${trace.id}:detail`);
    const replay = await read(`${trace.id}:replay`);
    const video = await read(`${trace.id}:video`);

    return {
      schemaVersion: session.schemaVersion,
      trace,
      detail: detail ? JSON.parse(detail) : null,
      replayEvents: replay ? replay.split('\n').length : 0,
      videoBytes: video ? Math.round(video.length * 0.75) : 0,
      videoDataUrl: video ?? null,
    };
  });

  if (!result.trace) throw new Error('no trace was recorded');
  const {trace, detail} = result;

  console.log('');
  check('session bumped to schemaVersion 2', result.schemaVersion === 2);
  check('steps recorded', detail.steps.length >= 4, `${detail.steps.length} steps`);
  check('navigation recorded as the first step', detail.steps[0]?.kind === 'navigation');
  check('console captured', detail.console.length >= 2, `${detail.console.length} entries`);
  check('network captured', detail.network.length >= 2, `${detail.network.length} requests`);
  check(
    'the 409 is flagged failed',
    detail.network.some((entry) => entry.status === 409 && entry.failed),
  );
  check(
    `sources reflect the mode`,
    trace.sources.network === (withDebugger ? 'cdp' : 'fallback'),
    trace.sources.network,
  );

  if (withDebugger) {
    check(
      'the thrown TypeError was captured with a stack',
      detail.console.some((entry) => entry.level === 'error' && entry.stack),
    );
    check(
      'the failed response body was collected',
      detail.network.some((entry) => entry.status === 409 && entry.responseBody),
    );
  } else {
    // What the fallback is for: no debugger, and the trace is still worth reading.
    check(
      'the in-page collectors still record the failure',
      detail.network.some((entry) => entry.status === 409 && entry.failed) && detail.steps.length >= 4,
    );
  }
  check(
    'store actions captured through the devtools bridge',
    trace.sources.state === 'devtools-bridge' && detail.state.length >= 2,
    `${detail.state.length} actions`,
  );
  const navigations = detail.steps.filter((step) => step.kind === 'navigation');
  check('the navigation mid-trace was recorded', navigations.length >= 2, `${navigations.length}`);
  check(
    'the timeline continues across the navigation instead of restarting',
    navigations.length >= 2 && navigations[navigations.length - 1].t > 2000,
    `second navigation at ${navigations[navigations.length - 1]?.t}ms`,
  );
  check(
    'steps stay ordered across the navigation',
    detail.steps.every((step, index) => index === 0 || step.t >= detail.steps[index - 1].t),
  );

  check('DOM replay recorded', result.replayEvents > 0, `${result.replayEvents} events`);
  check('summary matches the channels', trace.summary.failedRequests === 1);
  // tabCapture cannot be granted from automation, so this exercises the screencast fallback — the path
  // that runs whenever the panel was not opened from the toolbar on this tab.
  // tabCapture needs a toolbar invocation automation cannot make, so video here comes from the
  // debugger screencast — and with the debugger off there is honestly none, which the card says.
  check(
    withDebugger ? 'video encoded through the screencast fallback' : 'no video, and the trace says so',
    withDebugger
      ? result.videoBytes > 0 && trace.files.video !== undefined
      : result.videoBytes === 0 && trace.files.video === undefined,
    withDebugger ? `${(result.videoBytes / 1024).toFixed(0)} KB` : 'files.video omitted',
  );

  console.log('\n--- trace ---');
  console.log(`label     : ${trace.label}`);
  console.log(`duration  : ${(trace.durationMs / 1000).toFixed(1)}s`);
  console.log(`sources   : ${JSON.stringify(trace.sources)}`);
  console.log(`summary   : ${JSON.stringify(trace.summary)}`);
  console.log(
    `video     : ${result.videoBytes ? `${(result.videoBytes / 1024).toFixed(0)} KB` : 'none (tab capture needs a real toolbar invocation)'}`,
  );

  for (const [channel, rows] of Object.entries({
    steps: detail.steps.map((s) => `${s.t} ${s.kind} ${s.selector ?? s.url ?? ''} ${s.text ?? ''}`),
    console: detail.console.map((c) => `${c.t} ${c.level} ${c.text.split('\n')[0]}`),
    network: detail.network.map(
      (n) => `${n.t} ${n.method} ${n.url} ${n.status}${n.failed ? ' FAILED' : ''}`,
    ),
    state: detail.state.map((s) => `${s.t} ${s.action}`),
  })) {
    console.log(`\n${channel}:`);
    for (const row of rows) console.log(`  ${row}`);
  }

  if (result.videoDataUrl && process.argv.includes('--save-video')) {
    const {writeFileSync} = await import('node:fs');
    const path = join(tmpdir(), `caliper-smoke-${Date.now()}.webm`);
    writeFileSync(path, Buffer.from(result.videoDataUrl.split(',')[1], 'base64'));
    console.log(`
video written to ${path}`);
  }

  await context.close();

  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
