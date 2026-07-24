export const CLIENT_PATH_PREFIX = '/__caliper__';
export const CLIENT_BUNDLE_PATH = `${CLIENT_PATH_PREFIX}/client.js`;
export const ASK_WINDOW_MS = 50_000;
export const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CALIPER_VERSION = '0.1.0';
export const SNIPPET_PORT_DEFAULT = 4599;

export type CaliperMode = 'proxy' | 'snippet';

export const resolveMode = (): CaliperMode => (process.env.CALIPER_MODE === 'snippet' ? 'snippet' : 'proxy');

export const parsePort = (raw: string): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port "${raw}": expected an integer port between 1 and 65535.`);
  }
  return parsed;
};

export const resolveSnippetPort = (): number => {
  const raw = process.env.CALIPER_PORT;
  if (raw === undefined || raw === '') return SNIPPET_PORT_DEFAULT;
  try {
    return parsePort(raw);
  } catch {
    throw new Error(
      `Invalid CALIPER_PORT "${raw}": expected an integer port between 1 and 65535. ` +
        `Unset CALIPER_PORT to use the default (${SNIPPET_PORT_DEFAULT}).`,
    );
  }
};

export const buildSnippetTag = (port: number): string =>
  `<script data-caliper src="http://127.0.0.1:${port}${CLIENT_BUNDLE_PATH}"></script>`;
