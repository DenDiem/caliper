import type {ChildProcess} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import open, {apps} from 'open';

const LAUNCH_ERROR_TIMEOUT_MS = 3000;
const TEMP_PROFILE_PREFIX = 'caliper-review-profile-';

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

const tryOpen = async (url: string, name: string | readonly string[], args: readonly string[]): Promise<boolean> => {
  try {
    const subprocess = await open(url, {app: {name, arguments: args}});
    return await survivedLaunch(subprocess);
  } catch {
    return false;
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

export const launchReviewBrowser = async (url: string): Promise<void> => {
  const profileDir = createTempProfileDir();
  if (profileDir) {
    const isolatedArgs = ['--new-window', `--user-data-dir=${profileDir}`, ...CLEAN_LAUNCH_FLAGS];
    if (await tryOpen(url, apps.chrome, isolatedArgs)) return;
    if (await tryOpen(url, apps.edge, isolatedArgs)) return;
  }

  if (await tryOpen(url, apps.browserPrivate, [])) return;

  try {
    await open(url);
    console.error('caliper: opened the review in the default browser (no isolated Chrome/Edge profile available).');
  } catch (error) {
    console.error(`caliper: could not open a browser automatically (${errorMessage(error)}). Open the review url above manually.`);
  }
};
