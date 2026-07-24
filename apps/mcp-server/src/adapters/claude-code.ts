import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileAtomic} from './atomic-write';
import {buildServerEnv} from './server-env';
import type {AgentAdapter, InstallConfig} from './types';

// The Caliper entry merged into .mcp.json / ~/.claude.json:
// {"mcpServers": {"caliper": {"command": "node", "args": ["<abs>/dist/server.js"],
//   "env": {"CALIPER_TARGET": "<target>", "CALIPER_MODE": "<mode>", "CALIPER_PORT": "<port>"}}}}
const SERVER_ID = 'caliper';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mcpConfigPath = (global: boolean): string =>
  global ? join(homedir(), '.claude.json') : join(process.cwd(), '.mcp.json');

const skillTargetDir = (global: boolean): string =>
  global
    ? join(homedir(), '.claude', 'skills', 'caliper-review')
    : join(process.cwd(), '.claude', 'skills', 'caliper-review');

const skillSourcePath = (): string => {
  const distDir = dirname(fileURLToPath(import.meta.url));
  return join(distDir, '..', 'skills', 'caliper-review', 'SKILL.md');
};

const readJsonRecord = (path: string): Record<string, unknown> => {
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

const writeJsonRecord = (path: string, data: Record<string, unknown>): void => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
};

const withoutKey = (record: Record<string, unknown>, key: string): Record<string, unknown> => {
  const clone = {...record};
  delete clone[key];
  return clone;
};

const detect = (): boolean =>
  existsSync(join(homedir(), '.claude')) ||
  existsSync(join(process.cwd(), '.mcp.json')) ||
  existsSync(join(process.cwd(), '.claude'));

const registerServer = (config: InstallConfig): void => {
  const path = mcpConfigPath(config.global);
  const root = readJsonRecord(path);
  const existingServers = isRecord(root.mcpServers) ? root.mcpServers : {};
  writeJsonRecord(path, {
    ...root,
    mcpServers: {
      ...existingServers,
      [SERVER_ID]: {
        command: 'node',
        args: [config.serverCommand],
        env: buildServerEnv(config),
      },
    },
  });
  console.log(`  mcp server -> ${path}`);
};

const installGuidance = (config: InstallConfig): void => {
  const targetDir = skillTargetDir(config.global);
  mkdirSync(targetDir, {recursive: true});
  const targetFile = join(targetDir, 'SKILL.md');
  writeFileAtomic(targetFile, readFileSync(skillSourcePath(), 'utf8'));
  console.log(`  skill -> ${targetFile}`);
};

const uninstall = (config: Pick<InstallConfig, 'global'>): void => {
  const path = mcpConfigPath(config.global);
  if (existsSync(path)) {
    const root = readJsonRecord(path);
    if (isRecord(root.mcpServers) && SERVER_ID in root.mcpServers) {
      writeJsonRecord(path, {...root, mcpServers: withoutKey(root.mcpServers, SERVER_ID)});
      console.log(`  removed mcp server entry -> ${path}`);
    }
  }
  const skillDir = skillTargetDir(config.global);
  if (existsSync(skillDir)) {
    rmSync(skillDir, {recursive: true, force: true});
    console.log(`  removed skill -> ${skillDir}`);
  }
};

export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  detect,
  registerServer,
  installGuidance,
  uninstall,
};
