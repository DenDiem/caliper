import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

const TARGETS_FILENAME = 'caliper.targets.json';

type TargetMap = Record<string, string>;

const isTargetMap = (value: unknown): value is TargetMap => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
};

const parseTargetMap = (raw: string): TargetMap => {
  const parsed: unknown = JSON.parse(raw);
  return isTargetMap(parsed) ? parsed : {};
};

const readMapFile = (path: string): TargetMap => {
  try {
    return parseTargetMap(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};

// Walks up from process.cwd() to the filesystem root and returns the first caliper.targets.json found,
// so a file committed at the repo root travels to every worktree checked out beneath it.
const readFileMap = (startDir: string): TargetMap => {
  let current = startDir;
  for (;;) {
    const candidate = join(current, TARGETS_FILENAME);
    if (existsSync(candidate)) return readMapFile(candidate);
    const parent = dirname(current);
    if (parent === current) return {};
    current = parent;
  }
};

const readEnvMap = (): TargetMap => {
  const raw = process.env.CALIPER_TARGETS;
  if (raw === undefined || raw === '') return {};
  try {
    return parseTargetMap(raw);
  } catch {
    return {};
  }
};

const buildMap = (): TargetMap => ({...readFileMap(process.cwd()), ...readEnvMap()});

const unknownNameError = (name: string, map: TargetMap): Error => {
  const names = Object.keys(map);
  if (names.length === 0) {
    return new Error(
      `Unknown target "${name}": no named targets configured. Set caliper.targets.json or ` +
        'CALIPER_TARGETS, or pass a loopback URL.',
    );
  }
  return new Error(
    `Unknown target "${name}". Available named targets: ${names.join(', ')}. ` +
      'Or pass a loopback URL.',
  );
};

// Resolves the caliper_ask / caliper_design "target" argument to a loopback URL. An empty/undefined
// input falls back to CALIPER_TARGET (undefined when unset, so the caller's `if (!target)` fires); a
// value containing "://" is treated as a URL and returned verbatim (loopback validation stays with the
// caller); a bare name is looked up in the merged config map (CALIPER_TARGETS over caliper.targets.json).
export const resolveTarget = (input?: string): string | undefined => {
  const name = input?.trim();
  if (name === undefined || name === '') {
    const pinned = process.env.CALIPER_TARGET;
    return pinned === undefined || pinned === '' ? undefined : pinned;
  }
  if (name.includes('://')) return name;

  const map = buildMap();
  const resolved = map[name];
  if (resolved !== undefined) return resolved;
  throw unknownNameError(name, map);
};
