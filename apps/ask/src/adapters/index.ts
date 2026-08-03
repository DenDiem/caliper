import {claudeCodeAdapter} from './claude-code';
import {codexAdapter} from './codex';
import type {AgentAdapter} from './types';

// Adding a new agent = write `./<agent-id>.ts` exporting an AgentAdapter, then add it here.
export const ADAPTERS: readonly AgentAdapter[] = [claudeCodeAdapter, codexAdapter];

export {buildServerLaunch} from './server-command';
export type {AgentAdapter, InstallConfig} from './types';
