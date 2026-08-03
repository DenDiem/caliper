const REACHABILITY_TIMEOUT_MS = 3000;

// A dev server is "reachable" if anything answers on the target URL — any HTTP status (200, 302, even
// 404) proves the port is live. `fetch` only rejects on a network-level failure (connection refused) or
// the abort timeout, which is exactly the "server not started" case the caller reports.
export const isTargetReachable = async (
  target: string,
  timeoutMs: number = REACHABILITY_TIMEOUT_MS,
): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(target, {method: 'GET', signal: controller.signal, redirect: 'manual'});
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export const unreachableTargetError = (target: string): Error =>
  new Error(
    `dev server not reachable at ${target} (pinned CALIPER_TARGET). ` +
      'Start it (e.g. `npm run dev` / `npm start`), then call this tool again — ' +
      'or pass a reachable loopback `target`.',
  );
