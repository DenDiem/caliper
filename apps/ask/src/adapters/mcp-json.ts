import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {writeFileAtomic} from './atomic-write';
import {buildServerEnv} from './server-env';
import {buildServerLaunch} from './server-command';
import type {InstallConfig} from './types';

// Most MCP clients keep their servers in a JSON file under one key. They disagree only on where the
// file lives and what that key is called — VS Code says `servers`, everyone else says `mcpServers` —
// so the merge, the refusal to clobber, and the removal are written once here.
export const SERVER_ID = 'caliper';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readJsonRecord = (path: string): Record<string, unknown> => {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8').trim();
  if (raw.length === 0) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON -- fix or remove the file and try again.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${path} must contain a JSON object at its root -- refusing to overwrite it.`);
  }
  return parsed;
};

export const writeJsonRecord = (path: string, data: Record<string, unknown>): void => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
};

// Everything the client already had is preserved; only Caliper's own entry is written.
export const registerInJson = (path: string, key: string, config: InstallConfig): void => {
  const root = readJsonRecord(path);
  const existing = isRecord(root[key]) ? root[key] : {};
  const {command, args} = buildServerLaunch(config);

  writeJsonRecord(path, {
    ...root,
    [key]: {...existing, [SERVER_ID]: {command, args, env: buildServerEnv(config)}},
  });
  console.log(`  mcp server -> ${path}`);
};

export const removeFromJson = (path: string, key: string): void => {
  if (!existsSync(path)) return;

  const root = readJsonRecord(path);
  const servers = root[key];
  if (!isRecord(servers) || !(SERVER_ID in servers)) return;

  const remaining = {...servers};
  delete remaining[SERVER_ID];
  writeJsonRecord(path, {...root, [key]: remaining});
  console.log(`  removed mcp server entry -> ${path}`);
};
