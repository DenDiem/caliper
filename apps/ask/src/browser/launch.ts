import type {ChildProcess} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import open, {apps, openApp} from 'open';

const LAUNCH_ERROR_TIMEOUT_MS = 3000;
const TEMP_PROFILE_PREFIX = 'caliper-ask-profile-';
const DEVTOOLS_PORT_FILE = 'DevToolsActivePort';
const PORT_POLL_TIMEOUT_MS = 3000;
const PORT_POLL_INTERVAL_MS = 100;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// `open()` resolves as soon as the process is spawned; a missing browser binary surfaces
// asynchronously as an 'error' event on the returned child process, not as a rejected promise —
// so a launch is only considered successful once it survives a short window with no such event.
const survivedLaunch = (subprocess: ChildProcess): Promise<boolean> =>
  new Promise((resolve) => {
    const onError = (): void => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      subprocess.off('error', onError);
      resolve(true);
    }, LAUNCH_ERROR_TIMEOUT_MS);
    subprocess.once('error', onError);
  });

const tryOpen = async (
  url: string,
  name: string | readonly string[],
  args: readonly string[],
): Promise<ChildProcess | null> => {
  try {
    const subprocess = await open(url, {app: {name, arguments: args}});
    return (await survivedLaunch(subprocess)) ? subprocess : null;
  } catch {
    return null;
  }
};

const createTempProfileDir = (): string | null => {
  try {
    const dir = mkdtempSync(join(tmpdir(), TEMP_PROFILE_PREFIX));
    process.once('exit', () => {
      try {
        rmSync(dir, {recursive: true, force: true});
      } catch {
        // best-effort cleanup only
      }
    });
    return dir;
  } catch (error) {
    console.error(`caliper: could not create a temporary browser profile (${errorMessage(error)}).`);
    return null;
  }
};

// Opens the review URL in an isolated browser window — a throwaway Chrome/Edge profile with no
// extensions, tabs, or logged-in state, never the developer's default browser/profile. Falls back
// through progressively less-isolated options. Best-effort: never rejects, a failure only logs.
// Suppress the first-run experience a fresh Chrome/Edge profile otherwise shows — the sign-in
// nudge, "make default" prompt, sync opt-in, EU search-engine picker, and what's-new tab — so the
// review page appears immediately with no interstitial to click through.
const CLEAN_LAUNCH_FLAGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-search-engine-choice-screen',
  '--disable-features=ChromeWhatsNewUI',
] as const;

export interface BrowserWindow {
  close: () => void;
  debugPort: number | null;
}

const closer = (subprocess: ChildProcess, debugPort: number | null): BrowserWindow => ({
  close: () => {
    try {
      subprocess.kill();
    } catch {
      // best-effort — the design client also closes itself with window.close() on submit
    }
  },
  debugPort,
});

// The unclosable fallback: no subprocess handle, so no debug port and close() is a no-op.
const detachedWindow = (): BrowserWindow => ({close: () => undefined, debugPort: null});

// Opens the review URL in an isolated --new-window and returns a handle to close it — the ask flow's
// injected page script can't close a --new-window itself (only an --app window), so the server kills
// the browser process when the review completes. ask needs no CDP screenshots, so debugPort is null.
export const launchReviewBrowser = async (url: string): Promise<BrowserWindow> => {
  const profileDir = createTempProfileDir();
  if (profileDir) {
    const isolatedArgs = [
      '--new-window',
      `--user-data-dir=${profileDir}`,
      '--start-maximized',
      ...CLEAN_LAUNCH_FLAGS,
    ];
    const chrome = await tryOpen(url, apps.chrome, isolatedArgs);
    if (chrome) return closer(chrome, null);
    const edge = await tryOpen(url, apps.edge, isolatedArgs);
    if (edge) return closer(edge, null);
  }

  const priv = await tryOpen(url, apps.browserPrivate, []);
  if (priv) return closer(priv, null);

  try {
    await open(url);
    console.error('caliper: opened the review in the default browser (no isolated Chrome/Edge profile available).');
  } catch (error) {
    console.error(`caliper: could not open a browser automatically (${errorMessage(error)}). Open the review url above manually.`);
  }
  return detachedWindow();
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Chrome writes DevToolsActivePort once the debugging endpoint is listening: line 1 is the port it
// actually bound (we ask for 0, so it picks a free one). Poll briefly for the file to appear.
const readDebugPort = (profileDir: string): number | null => {
  try {
    const firstLine = readFileSync(join(profileDir, DEVTOOLS_PORT_FILE), 'utf8').split('\n', 1)[0] ?? '';
    const port = Number.parseInt(firstLine.trim(), 10);
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
};

const pollDebugPort = async (profileDir: string): Promise<number | null> => {
  const deadline = Date.now() + PORT_POLL_TIMEOUT_MS;
  for (;;) {
    const port = readDebugPort(profileDir);
    if (port !== null) return port;
    if (Date.now() >= deadline) return null;
    await delay(PORT_POLL_INTERVAL_MS);
  }
};

// Design mode opens the review as a chromeless --app window in a throwaway profile and returns a
// handle to close it when the developer submits, plus the DevTools debugging port for CDP
// screenshots (null when unavailable). Falls back to a normal review window (still closeable, no
// debug port) when an isolated Chrome/Edge app window isn't available.
export const launchDesignBrowser = async (url: string): Promise<BrowserWindow> => {
  const profileDir = createTempProfileDir();
  if (profileDir) {
    const appArgs = [
      `--app=${url}`,
      `--user-data-dir=${profileDir}`,
      '--remote-debugging-port=0',
      ...CLEAN_LAUNCH_FLAGS,
    ];
    for (const name of [apps.chrome, apps.edge]) {
      try {
        const subprocess = await openApp(name, {arguments: appArgs});
        if (await survivedLaunch(subprocess)) return closer(subprocess, await pollDebugPort(profileDir));
      } catch {
        // try the next browser
      }
    }
  }

  return launchReviewBrowser(url);
};
