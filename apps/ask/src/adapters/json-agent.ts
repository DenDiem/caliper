import {existsSync} from 'node:fs';
import {
  dropGuidance,
  dropOwnedGuidance,
  wrapSection,
  writeGuidance,
  writeOwnedGuidance,
} from './guidance-section';
import {buildGuidanceBody} from './guidance-text';
import {registerInJson, removeFromJson} from './mcp-json';
import type {AgentAdapter, InstallConfig} from './types';

// Cursor, Windsurf, VS Code and Gemini CLI all keep MCP servers in a JSON file and their standing
// instructions in a markdown file. They differ only in the four values below, so each adapter is a
// description of those differences rather than another copy of the same reading and merging.
export interface JsonAgentSpec {
  id: string;
  // `servers` for VS Code, `mcpServers` for everyone else. Getting this wrong installs silently and
  // does nothing, which is why it is stated per agent instead of assumed.
  serversKey: string;
  configPath: (global: boolean) => string;
  guidancePath: (global: boolean) => string;
  guidanceLabel: string;
  // True when the guidance file is named after Caliper and therefore belongs to it — written whole,
  // removed whole. False when Caliper is a guest in a file the project owns (AGENTS.md, GEMINI.md,
  // copilot-instructions.md), where it keeps to a delimited section.
  ownsGuidanceFile?: boolean;
  // Prepended for an owned file only, where it can occupy the first line — a Cursor .mdc needs its
  // frontmatter there or the rule is never applied.
  guidancePreamble?: string;
  detectPaths: (() => string)[];
}

export const createJsonAgent = (spec: JsonAgentSpec): AgentAdapter => ({
  id: spec.id,

  detect: () => spec.detectPaths.some((path) => existsSync(path())),

  registerServer: (config: InstallConfig) =>
    registerInJson(spec.configPath(config.global), spec.serversKey, config),

  installGuidance: (config: InstallConfig) => {
    const path = spec.guidancePath(config.global);
    const body = buildGuidanceBody(config);

    if (spec.ownsGuidanceFile) {
      const content = spec.guidancePreamble ? `${spec.guidancePreamble}\n\n${body}` : body;
      writeOwnedGuidance(path, content, spec.guidanceLabel);
      return;
    }
    writeGuidance(path, wrapSection(body), spec.guidanceLabel);
  },

  uninstall: (config) => {
    removeFromJson(spec.configPath(config.global), spec.serversKey);
    const path = spec.guidancePath(config.global);
    if (spec.ownsGuidanceFile) dropOwnedGuidance(path, spec.guidanceLabel);
    else dropGuidance(path, spec.guidanceLabel);
  },
});
