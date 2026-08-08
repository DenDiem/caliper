// Runs an agent-authored `setup` snippet in the page to bring the app into a state where a route guard
// passes (dispatch the store action / seed the flag it checks), then reports whether the subsequent
// client-side navigation settled on the intended route. This executes agent code same-origin in the
// developer's browser, so it is ONLY ever invoked from the panel's explicit run/skip consent gate —
// never automatically.

const STABLE_MS = 400;
const TIMEOUT_MS = 5000;

export type SetupExecResult = {ok: true} | {ok: false; csp: boolean; message: string};

// `new Function` (not `location.assign` to a `javascript:` url or an inline <script>) so a snippet
// error and a CSP block are both catchable synchronously. A CSP without `script-src 'unsafe-eval'`
// throws an EvalError-shaped error rather than a snippet bug — surfaced separately so the gate can tell
// the developer the app blocked it rather than the snippet being wrong.
export const runSetup = (snippet: string): SetupExecResult => {
  try {
    new Function(snippet)();
    return {ok: true};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const csp = error instanceof EvalError || /unsafe-eval|content security policy/i.test(message);
    return {ok: false, csp, message};
  }
};

export type UrlSettleResult = 'expected' | 'redirected' | 'timeout';

// A guard redirects on a later tick, so navigating is not the same as arriving. Watch `location` settle
// (unchanged for a debounce window) before deciding — `expected` if it landed on the route, `redirected`
// if the guard bounced it elsewhere, `timeout` if it never settled. Runs only because setup navigates
// client-side (no reload), so this in-page promise survives to resolve.
export const waitForUrlStable = (expectedRoute: string): Promise<UrlSettleResult> =>
  new Promise((resolve) => {
    const start = performance.now();
    let lastHref = location.href;
    let stableSince = start;

    const tick = (): void => {
      const now = performance.now();
      if (location.href !== lastHref) {
        lastHref = location.href;
        stableSince = now;
      }
      if (now - stableSince >= STABLE_MS) {
        resolve(location.pathname === expectedRoute ? 'expected' : 'redirected');
        return;
      }
      if (now - start >= TIMEOUT_MS) {
        resolve('timeout');
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
