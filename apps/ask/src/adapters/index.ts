import {claudeCodeAdapter} from './claude-code';
import {codexAdapter} from './codex';
import {cursorAdapter, geminiAdapter, vscodeAdapter, windsurfAdapter} from './json-agents';
import type {AgentAdapter} from './types';

// Adding a JSON-configured agent = one entry in ./json-agents.ts describing where its config and its
// instructions live. Claude Code and Codex keep their own files because neither is JSON-plus-markdown:
// Claude Code installs real skills, Codex writes TOML.
export const ADAPTERS: readonly AgentAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  cursorAdapter,
  windsurfAdapter,
  vscodeAdapter,
  geminiAdapter,
];

export {buildServerLaunch} from './server-command';
export type {AgentAdapter, InstallConfig} from './types';
