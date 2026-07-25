import {request} from 'node:http';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SessionRegistry} from '../src/session/registry';
import {startProxyServer} from '../src/http/proxy-server';
import {makeApiHandlers} from '../src/http/api';
import {toReviewToon} from '@caliper/core';
import open from 'open';

const DEMO_TARGET = 'http://127.0.0.1:5599';
const BROWSER_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const PROGRESS_INTERVAL_MS = 3000; // 3 seconds

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
  // Check if demo target is reachable
  const targetReachable = await checkDemoTarget();
  if (!targetReachable) {
    console.error('Error: demo target not reachable');
    console.error('Please run in another terminal:');
    console.error('  pnpm --filter @caliper/mcp-server demo');
    process.exit(1);
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
    onListen: (origin) => {
      registry.setOrigin(sessionId, origin, [origin]);

      console.log(`Review URL: ${origin}`);

      // Best effort: headless/WSL sessions still have the URL printed above.
      try {
        open(origin);
      } catch {
        // ignored
      }

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
