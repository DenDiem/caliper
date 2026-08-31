/**
 * Records the Caliper Trace demo GIF: the reproduction in the app, then the trace an agent reads.
 *
 * Both halves are real. The reproduction is driven against the demo checkout page with the extension
 * loaded; the terminal half shows the actual stdout of `caliper read` and `caliper trace --around`, run
 * over the session that reproduction just produced. Nothing is mocked up for the camera.
 *
 * Needs the demo server running and the extension built.
 * Usage: node scripts/record-trace-demo.mjs [--keep]
 */
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EXTENSION = join(REPO, 'apps/qa-extension/.output/chrome-mv3');
const CLI = join(REPO, 'apps/ask/dist/cli.js');
const OUT = join(REPO, 'docs/media/qa-extension/trace-flow.gif');
const DEMO_ORIGIN = 'http://127.0.0.1:5599';

const WIDTH = 1280;
const HEIGHT = 800;
const FPS = 14;

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

// The terminal frame is presentation; every character inside it is output the CLI actually printed.
const terminalPage = (blocks) => `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  :root { color-scheme: dark; }
  body {
    margin: 0; height: 100vh; display: grid; place-items: center;
    background: #0a0d11; font-family: 'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace;
  }
  .term {
    width: 1120px; height: 700px; overflow: hidden;
    background: #0b0f14; border: 1px solid #1d242c; border-radius: 10px;
    box-shadow: 0 24px 60px rgba(5, 8, 12, 0.55);
    display: flex; flex-direction: column;
  }
  .bar { display: flex; align-items: center; gap: 7px; padding: 12px 14px; border-bottom: 1px solid #1d242c; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #232c36; }
  .body { flex: 1; min-height: 0; overflow: hidden; padding: 16px 20px; font-size: 14.5px; line-height: 1.55; white-space: pre-wrap; color: #b8c4d1; }
  .cmd { color: #eaf0f5; }
  .cmd::before { content: '$ '; color: #34d8c0; }
  .fail { color: #f2545b; }
  .ok { color: #34d8c0; }
  .cursor { display: inline-block; width: 8px; height: 17px; background: #34d8c0; vertical-align: -3px; }
</style></head>
<body><div class="term">
  <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <div class="body" id="body"></div>
</div>
<script>
  const BLOCKS = ${JSON.stringify(blocks)};
  const body = document.getElementById('body');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const highlight = (line) => {
    if (/FAILED|error |TypeError/.test(line)) return '<span class="fail">' + line + '</span>';
    if (/^\\s*\\d+ (POST|GET) .*20\\d/.test(line)) return '<span class="ok">' + line + '</span>';
    return line;
  };

  window.__done = false;
  (async () => {
    for (const [index, block] of BLOCKS.entries()) {
      // The first command's output fills the pane; a real session would scroll, and clearing reads the
      // same way while keeping the second command's answer whole on screen.
      if (index > 0) {
        await sleep(500);
        body.textContent = '';
      }
      const cmd = document.createElement('div');
      cmd.className = 'cmd';
      body.appendChild(cmd);
      for (const ch of block.command) {
        cmd.textContent += ch;
        body.scrollTop = body.scrollHeight;
        await sleep(26);
      }
      await sleep(420);

      const out = document.createElement('div');
      body.appendChild(out);
      const lines = block.output.split('\\n');
      for (const line of lines) {
        out.innerHTML += highlight(line) + '\\n';
        await sleep(34);
      }
      await sleep(700);
    }
    window.__done = true;
  })();
</script></body></html>`;

const run = (args) => execFileSync(process.execPath, [CLI, ...args], {encoding: 'utf8', cwd: REPO});

const main = async () => {
  if (!existsSync(EXTENSION)) throw new Error('build the extension first');
  if (!existsSync(CLI)) throw new Error('build @dendiem/caliper first');

  await fetch(`${DEMO_ORIGIN}/api/orders`, {method: 'DELETE'}).catch(() => {
    throw new Error('Demo server not reachable. Run: pnpm --filter @dendiem/caliper demo');
  });

  const {chromium} = loadPlaywright();
  const executablePath = findChromium();
  const stage = mkdtempSync(join(tmpdir(), 'caliper-demo-'));
  const clipA = join(stage, 'clip-a');
  const clipB = join(stage, 'clip-b');

  // ---- clip A: the reproduction, with the extension recording it ----
  const context = await chromium.launchPersistentContext(join(stage, 'profile'), {
    headless: false,
    ...(executablePath ? {executablePath} : {channel: 'chrome'}),
    viewport: {width: WIDTH, height: HEIGHT},
    recordVideo: {dir: clipA, size: {width: WIDTH, height: HEIGHT}},
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const page = await context.newPage();
  await page.goto(`${DEMO_ORIGIN}/checkout`, {waitUntil: 'domcontentloaded'});

  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', {timeout: 20_000}));
  const extensionId = new URL(worker.url()).host;
  const tabId = await worker.evaluate(
    async ([url]) => (await chrome.tabs.query({url}))[0].id,
    [`${DEMO_ORIGIN}/*`],
  );

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.bringToFront();
  await wait(700);

  const send = (message) => panel.evaluate((payload) => chrome.runtime.sendMessage(payload), message);

  await send({type: 'caliper/trace-start', tabId, label: 'Place order fails on the second submit'});
  await wait(1200);

  await page.click('#place-order');
  await wait(1600);
  await page.fill('#quantity', '2');
  await wait(700);
  await page.click('#place-order');
  await wait(2400);

  await send({type: 'caliper/trace-stop', tabId});
  await wait(2600);

  const exported = await worker.evaluate(async () => {
    const store = (await chrome.storage.local.get('caliper.store'))['caliper.store'];
    const session = store.sessions.find((item) => item.id === store.activeId);
    const trace = session.traces.at(-1);

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('caliper-trace', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const detail = await new Promise((resolve) => {
      const get = db.transaction('blobs', 'readonly').objectStore('blobs').get(`${trace.id}:detail`);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(undefined);
    });

    return {session: JSON.stringify({...session, assets: {}}, null, 2), detail, trace};
  });

  // Each page in the context records its own file, including the initial about:blank — so the clip is
  // taken from the page object rather than by scanning the directory.
  const clipAPath = await page.video().path();
  await page.close();
  await panel.close();
  await context.close();

  // ---- the same session, read back through the real CLI ----
  const bundle = join(stage, 'bundle');
  mkdirSync(bundle, {recursive: true});
  writeFileSync(join(bundle, 'session.json'), exported.session);
  writeFileSync(join(bundle, exported.trace.files.trace), exported.detail);

  const readOut = run(['read', bundle]);
  const errorAt = JSON.parse(exported.detail).console.find((entry) => entry.level === 'error');
  const around = `${(errorAt.t / 1000).toFixed(1)}s`;
  // Taken from the output rather than rebuilt: the folder is named after the session id and the file
  // after the trace id, and reconstructing that pairing by hand is exactly how it goes wrong.
  const traceFile = readOut.match(/trace: (\S+\.trace\.json)/)?.[1];
  if (!traceFile) throw new Error('caliper read printed no trace path');
  const sliceOut = run(['trace', traceFile, '--around', around]);

  const blocks = [
    {command: 'caliper read ./caliper-qa-session.zip', output: readOut.trim()},
    {command: `caliper trace ${traceFile} --around ${around}`, output: sliceOut.trim()},
  ];

  // ---- clip B: the terminal, typing out that real output ----
  const second = await chromium.launch({
    headless: false,
    ...(executablePath ? {executablePath} : {channel: 'chrome'}),
  });
  const termContext = await second.newContext({
    viewport: {width: WIDTH, height: HEIGHT},
    recordVideo: {dir: clipB, size: {width: WIDTH, height: HEIGHT}},
  });
  const term = await termContext.newPage();
  await term.setContent(terminalPage(blocks));
  await term.waitForFunction(() => window.__done === true, {timeout: 90_000});
  await wait(1600);
  const clipBPath = await term.video().path();
  await term.close();
  await termContext.close();
  await second.close();

  // ---- stitch: two passes so the dark UI does not band ----
  const a = clipAPath;
  const b = clipBPath;
  const palette = join(stage, 'palette.png');
  const filter =
    `[0:v]fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,setsar=1[a];` +
    `[1:v]fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,setsar=1[b];[a][b]concat=n=2:v=1[v]`;

  execFileSync('ffmpeg', ['-y', '-i', a, '-i', b, '-filter_complex', `${filter};[v]palettegen=stats_mode=diff[p]`, '-map', '[p]', palette], {stdio: 'ignore'});
  mkdirSync(join(REPO, 'docs/media/qa-extension'), {recursive: true});
  execFileSync(
    'ffmpeg',
    ['-y', '-i', a, '-i', b, '-i', palette, '-filter_complex', `${filter};[v][2:v]paletteuse=dither=bayer:bayer_scale=3`, OUT],
    {stdio: 'ignore'},
  );

  const {size} = await import('node:fs').then((fs) => fs.statSync(OUT));
  console.log(`wrote ${OUT} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`error at ${around}; read output ${readOut.split('\n').length} lines`);

  if (!process.argv.includes('--keep')) rmSync(stage, {recursive: true, force: true});
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
