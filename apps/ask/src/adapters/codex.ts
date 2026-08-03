import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {writeFileAtomic} from './atomic-write';
import {buildServerEnv} from './server-env';
import {buildServerLaunch} from './server-command';
import type {AgentAdapter, InstallConfig} from './types';

// The Caliper block merged into ~/.codex/config.toml (auto-update mode by default):
// [mcp_servers.caliper]
// command = "npx"
// args = ["-y", "@dendiem/caliper@latest", "serve"]
// env = { CALIPER_TARGET = "<target>", CALIPER_MODE = "<mode>", CALIPER_PORT = "<port>" }
// tool_timeout_sec = 600
// Pinned mode (--pinned) instead writes command = "node", args = ["<abs>/dist/server.js"].
const BLOCK_HEADER = '[mcp_servers.caliper]';
const TOOL_TIMEOUT_SEC = 600;

const SECTION_START = '<!-- caliper:start -->';
const SECTION_END = '<!-- caliper:end -->';
const SECTION_PATTERN = /<!-- caliper:start -->[\s\S]*?<!-- caliper:end -->/u;

const tomlString = (value: string): string => JSON.stringify(value);

const configTomlPath = (): string => join(homedir(), '.codex', 'config.toml');

const agentsMdPath = (global: boolean): string =>
  global ? join(homedir(), '.codex', 'AGENTS.md') : join(process.cwd(), 'AGENTS.md');

const trimTrailingBlankLines = (lines: readonly string[]): string[] => {
  const result = [...lines];
  while (result.length > 0 && result[result.length - 1] === '') result.pop();
  return result;
};

const findBlockRange = (lines: readonly string[]): {start: number; end: number} | null => {
  const start = lines.findIndex((line) => line.trim() === BLOCK_HEADER);
  if (start === -1) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && line.trim().startsWith('[')) {
      end = index;
      break;
    }
  }
  return {start, end};
};

const buildCaliperBlock = (config: InstallConfig): string => {
  const {command, args} = buildServerLaunch(config);
  const envEntries = Object.entries(buildServerEnv(config))
    .map(([key, value]) => `${key} = ${tomlString(value)}`)
    .join(', ');
  return [
    BLOCK_HEADER,
    `command = ${tomlString(command)}`,
    `args = [${args.map(tomlString).join(', ')}]`,
    `env = { ${envEntries} }`,
    `tool_timeout_sec = ${TOOL_TIMEOUT_SEC}`,
  ].join('\n');
};

const upsertCaliperBlock = (content: string, block: string): string => {
  const lines = content.length > 0 ? content.split('\n') : [];
  const range = findBlockRange(lines);
  if (!range) {
    const trimmed = trimTrailingBlankLines(lines);
    const merged = trimmed.length > 0 ? [...trimmed, '', ...block.split('\n')] : block.split('\n');
    return `${merged.join('\n')}\n`;
  }
  const merged = [...lines.slice(0, range.start), ...block.split('\n'), ...lines.slice(range.end)];
  return `${trimTrailingBlankLines(merged).join('\n')}\n`;
};

const removeCaliperBlock = (content: string): string => {
  const lines = content.length > 0 ? content.split('\n') : [];
  const range = findBlockRange(lines);
  if (!range) return content;
  const merged = trimTrailingBlankLines([
    ...lines.slice(0, range.start),
    ...lines.slice(range.end),
  ]);
  return merged.length > 0 ? `${merged.join('\n')}\n` : '';
};

const buildCaliperSection = (config: InstallConfig): string =>
  [
    SECTION_START,
    '## Caliper review',
    '',
    'When you are implementing a design and are genuinely unsure what a UI region should do or ' +
      'look like, call the `caliper_ask` MCP tool so the developer can answer directly in the ' +
      'running page. Anchor each zone with an ordinary CSS selector for an element already on the ' +
      "page — do not edit the app's source to add anchors. Include each zone's route (the path " +
      'that element is on). A review can span multiple pages: the developer navigates the real ' +
      'app, including logging in or working through a flow to reach gated pages, and the ' +
      'questions for each page light up as the developer gets there.',
    `Pinned review target: ${config.target}.`,
    'No reliable selector yet? Ask anyway — the developer can click the region to point at it.',
    'If the result contains status: PENDING, call `caliper_wait` with the returned ticket to keep waiting.',
    '',
    'Default is proxy mode: nothing to change in the app. If the review page looks broken — ' +
      'failing API calls with CORS errors, an OAuth redirect bouncing out, or a Next.js ' +
      '`allowedDevOrigins` warning — that is an origin shift proxy mode cannot fix. Switch to ' +
      'snippet mode: re-run `caliper init --mode snippet`, add the `<script>` line from ' +
      '`caliper snippet` to the root HTML file, restart the agent, and remove the line when the ' +
      'review work is done.',
    SECTION_END,
  ].join('\n');

const upsertCaliperSection = (content: string, section: string): string => {
  if (SECTION_PATTERN.test(content)) {
    return `${content.replace(SECTION_PATTERN, section).trimEnd()}\n`;
  }
  const trimmed = content.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${section}\n` : `${section}\n`;
};

const removeCaliperSection = (content: string): string => {
  if (!SECTION_PATTERN.test(content)) return content;
  const result = content
    .replace(SECTION_PATTERN, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd();
  return result.length > 0 ? `${result}\n` : '';
};

const detect = (): boolean => existsSync(join(homedir(), '.codex'));

const registerServer = (config: InstallConfig): void => {
  const path = configTomlPath();
  mkdirSync(dirname(path), {recursive: true});
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileAtomic(path, upsertCaliperBlock(existing, buildCaliperBlock(config)));
  console.log(`  mcp server -> ${path}`);
};

const installGuidance = (config: InstallConfig): void => {
  const path = agentsMdPath(config.global);
  mkdirSync(dirname(path), {recursive: true});
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileAtomic(path, upsertCaliperSection(existing, buildCaliperSection(config)));
  console.log(`  agents guidance -> ${path}`);
};

const uninstall = (config: Pick<InstallConfig, 'global'>): void => {
  const tomlPath = configTomlPath();
  if (existsSync(tomlPath)) {
    const before = readFileSync(tomlPath, 'utf8');
    const after = removeCaliperBlock(before);
    if (after !== before) {
      writeFileAtomic(tomlPath, after);
      console.log(`  removed mcp server block -> ${tomlPath}`);
    }
  }
  const mdPath = agentsMdPath(config.global);
  if (existsSync(mdPath)) {
    const before = readFileSync(mdPath, 'utf8');
    const after = removeCaliperSection(before);
    if (after !== before) {
      writeFileAtomic(mdPath, after);
      console.log(`  removed agents guidance -> ${mdPath}`);
    }
  }
};

export const codexAdapter: AgentAdapter = {
  id: 'codex',
  detect,
  registerServer,
  installGuidance,
  uninstall,
};
