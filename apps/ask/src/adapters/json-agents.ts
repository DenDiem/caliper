import {homedir} from 'node:os';
import {join} from 'node:path';
import {createJsonAgent} from './json-agent';
import type {AgentAdapter} from './types';

const home = (...parts: string[]): string => join(homedir(), ...parts);
const project = (...parts: string[]): string => join(process.cwd(), ...parts);

// Cursor reads project rules from .cursor/rules/*.mdc; the frontmatter is what makes a rule always
// apply rather than wait to be requested by name.
const CURSOR_RULE_FRONTMATTER = [
  '---',
  'description: Caliper — ask the developer about ambiguous UI, and read recorded QA sessions',
  'alwaysApply: true',
  '---',
].join('\n');

export const cursorAdapter: AgentAdapter = createJsonAgent({
  id: 'cursor',
  serversKey: 'mcpServers',
  configPath: (global) => (global ? home('.cursor', 'mcp.json') : project('.cursor', 'mcp.json')),
  guidancePath: (global) =>
    global ? home('.cursor', 'rules', 'caliper.mdc') : project('.cursor', 'rules', 'caliper.mdc'),
  guidanceLabel: 'cursor rule',
  ownsGuidanceFile: true,
  guidancePreamble: CURSOR_RULE_FRONTMATTER,
  detectPaths: [() => home('.cursor'), () => project('.cursor')],
});

export const windsurfAdapter: AgentAdapter = createJsonAgent({
  id: 'windsurf',
  serversKey: 'mcpServers',
  // Windsurf keeps MCP config per user rather than per project, so both scopes resolve to the same
  // file. The scope still matters for the rules file, which is why it is not collapsed away.
  configPath: () => home('.codeium', 'windsurf', 'mcp_config.json'),
  guidancePath: (global) =>
    global
      ? home('.codeium', 'windsurf', 'memories', 'caliper.md')
      : project('.windsurf', 'rules', 'caliper.md'),
  guidanceLabel: 'windsurf rule',
  ownsGuidanceFile: true,
  detectPaths: [() => home('.codeium', 'windsurf'), () => project('.windsurf')],
});

export const vscodeAdapter: AgentAdapter = createJsonAgent({
  id: 'vscode',
  // VS Code is the odd one out: its key is `servers`, not `mcpServers`.
  serversKey: 'servers',
  configPath: (global) => (global ? home('.mcp.json') : project('.vscode', 'mcp.json')),
  guidancePath: () => project('.github', 'copilot-instructions.md'),
  guidanceLabel: 'copilot instructions',
  detectPaths: [() => project('.vscode'), () => project('.github', 'copilot-instructions.md')],
});

export const geminiAdapter: AgentAdapter = createJsonAgent({
  id: 'gemini-cli',
  serversKey: 'mcpServers',
  configPath: (global) =>
    global ? home('.gemini', 'settings.json') : project('.gemini', 'settings.json'),
  guidancePath: (global) => (global ? home('.gemini', 'GEMINI.md') : project('GEMINI.md')),
  guidanceLabel: 'gemini guidance',
  detectPaths: [() => home('.gemini'), () => project('.gemini'), () => project('GEMINI.md')],
});
