import {request} from 'node:http';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {SessionRegistry} from '../src/session/registry';
import {startProxyServer} from '../src/http/proxy-server';
import {makeApiHandlers} from '../src/http/api';
import {launchReviewBrowser} from '../src/browser/launch';
import {toReviewToon} from '@caliper/core';

const DEMO_TARGET = 'http://127.0.0.1:5599';
const BROWSER_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const PROGRESS_INTERVAL_MS = 3000; // 3 seconds
const DEMO_SERVER_START_TIMEOUT_MS = 8000;
const DEMO_SERVER_POLL_INTERVAL_MS = 300;

// Anchored by ordinary CSS selectors of the demo page, not `data-caliper-ref` — these `ref` ids are
// deliberately distinct from the page's existing `data-caliper-ref` values, so resolution can only
// go through the selector fallback in `locateElement` (apps/mcp-server/client/review-controller.ts).
// This doubles as proof that selector-only anchoring works against real markup with zero page edits.
const zones = [
  {
    ref: 'price-block',
    route: '/',
    selector: '.price-block',
    question: 'Should the price show USD only, or all three currencies inline?',
  },
  {
    ref: 'price-info',
    route: '/',
    selector: '.price-info',
    question: 'What should the price-info icon reveal on click — a tooltip, or a full breakdown modal?',
  },
  {
    ref: 'seller-card',
    route: '/',
    selector: '.seller-card',
    question: "Should the seller card show a rating, or does 'Official dealer' plus the verified badge cover trust?",
  },
  {
    ref: 'cta-phone',
    route: '/',
    selector: '.cta-phone',
    question: 'Should the phone number stay masked until the user clicks, or reveal on load?',
  },
  {
    ref: 'gallery-main',
    route: '/',
    selector: '.gallery-main',
    question: 'Should the gallery auto-advance photos, or stay static until the user interacts?',
  },
  {
    ref: 'write-chat-link',
    route: '/',
    selector: '.write-chat-link',
    question: "Should 'Write in chat' open inline like it does now, or navigate to a full chat page?",
  },
  {
    ref: 'promo-banner',
    route: '/',
    selector: '.promo-banner',
    question: 'Where should the seasonal promo banner go once one is added to this page?',
  },
  {
    ref: 'search-results-count',
    route: '/search',
    selector: '.results-count',
    question: 'Should the results count update live as filters change, or only after pressing "Apply"?',
  },
  {
    ref: 'search-result-card',
    route: '/search',
    selector: '.result-card',
    question: 'Should each result card show the seller name, or just price and title?',
  },
];

const checkDemoTarget = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const req = request(DEMO_TARGET, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 404);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => resolve(false));
    req.end();
  });
};

const waitForDemoTarget = async (timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkDemoTarget()) return true;
    await delay(DEMO_SERVER_POLL_INTERVAL_MS);
  }
  return checkDemoTarget();
};

const mcpServerRoot = (): string => join(dirname(fileURLToPath(import.meta.url)), '..');

// Spawned via a shell so `tsx`'s .cmd shim resolves on Windows; `killDemoServer` below accounts
// for the resulting process tree (cmd.exe -> node) when tearing it down on that platform.
const startDemoServer = (): ChildProcess =>
  spawn('tsx', ['demo/server.ts'], {cwd: mcpServerRoot(), shell: true, stdio: 'ignore'});

const killDemoServer = (child: ChildProcess): void => {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    return;
  }
  child.kill();
};

const clientBundlePath = (): string => {
  const distPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'client.js');

  if (!existsSync(distPath)) {
    console.error('Error: dist/client.js not found');
    console.error('Please run: pnpm --filter @caliper/mcp-server build:client');
    process.exit(1);
  }

  return distPath;
};

const formatProgressLine = (answered: number, total: number): string => {
  const remaining = total - answered;
  return `Progress: ${answered}/${total} answered${remaining > 0 ? `, ${remaining} pending` : ' — ready to submit'}`;
};

const main = async (): Promise<void> => {
  // Check if demo target is reachable; if not, start it ourselves so `demo:review` is one command.
  let demoServerChild: ChildProcess | null = null;
  let targetReachable = await checkDemoTarget();
  if (!targetReachable) {
    console.log(`Demo target not reachable on ${DEMO_TARGET} — starting it now...`);
    demoServerChild = startDemoServer();
    process.once('exit', () => {
      if (demoServerChild) killDemoServer(demoServerChild);
    });
    process.once('SIGINT', () => process.exit(130));

    targetReachable = await waitForDemoTarget(DEMO_SERVER_START_TIMEOUT_MS);
    if (!targetReachable) {
      console.error('Error: demo target not reachable');
      console.error('Please run in another terminal:');
      console.error('  pnpm --filter @caliper/mcp-server demo');
      process.exit(1);
    }
    console.log('Demo target is up.');
  }

  const bundlePath = clientBundlePath();

  // Create registry and open session
  const registry = new SessionRegistry();
  const state = registry.open(DEMO_TARGET);
  const sessionId = state.id;
  const token = state.token;

  // Merge zones with proper route handling
  registry.merge(
    sessionId,
    zones.map((zone) => ({
      ref: zone.ref,
      route: zone.route,
      selector: zone.selector,
      question: zone.question,
    })),
  );

  // Start proxy server
  const handlers = makeApiHandlers(registry, sessionId);
  const proxyServer = startProxyServer({
    target: DEMO_TARGET,
    sessionId,
    token,
    handlers,
    clientBundlePath: bundlePath,
    onListen: async (origin) => {
      registry.setOrigin(sessionId, origin, [origin]);

      console.log(`Review URL: ${origin}`);

      await launchReviewBrowser(origin);

      // Print initial progress
      const currentState = registry.get(sessionId);
      if (currentState) {
        const answered = currentState.zones.filter((z) => z.answered).length;
        console.log(formatProgressLine(answered, currentState.zones.length));
      }
    },
  });

  // Start progress monitor
  let lastPrintTime = Date.now();
  const progressInterval = setInterval(() => {
    const now = Date.now();
    if (now - lastPrintTime >= PROGRESS_INTERVAL_MS) {
      const currentState = registry.get(sessionId);
      if (currentState) {
        const answered = currentState.zones.filter((z) => z.answered).length;
        console.log(formatProgressLine(answered, currentState.zones.length));
      }
      lastPrintTime = now;
    }
  }, 1000);

  // Wait for all answers with timeout
  const finalState = await registry.wait(sessionId, BROWSER_TIMEOUT_MS);

  clearInterval(progressInterval);

  // Print results
  console.log('\n--- agent receives ---');
  console.log(toReviewToon(finalState));
  console.log('--- agent receives ---\n');

  proxyServer.close();
  process.exit(0);
};

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
