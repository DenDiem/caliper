import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {cursorAdapter, geminiAdapter, vscodeAdapter, windsurfAdapter} from './json-agents';
import type {InstallConfig} from './types';

const config: InstallConfig = {
  serverCommand: '/abs/dist/server.js',
  autoUpdate: true,
  target: 'http://127.0.0.1:5599',
  mode: 'proxy',
  port: null,
  global: false,
};

let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), 'caliper-agent-')));
});

afterEach(() => {
  process.chdir(cwd);
});

const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8'));

describe('cursor', () => {
  it('registers the server where Cursor looks for it', () => {
    cursorAdapter.registerServer(config);
    const written = readJson(join(process.cwd(), '.cursor', 'mcp.json'));
    expect(written).toHaveProperty('mcpServers.caliper.command', 'npx');
    expect(written).toHaveProperty('mcpServers.caliper.env.CALIPER_TARGET', 'http://127.0.0.1:5599');
  });

  // Cursor only reads frontmatter that is the very first thing in the file. Wrapped in section markers
  // it parses as prose, alwaysApply is ignored, and the rule silently never applies — so the position
  // is the assertion, not merely the presence.
  it('writes an always-apply rule with the frontmatter first', () => {
    cursorAdapter.installGuidance(config);
    const rule = readFileSync(join(process.cwd(), '.cursor', 'rules', 'caliper.mdc'), 'utf8');

    const lines = rule.split(/\r?\n/);
    expect(lines[0]).toBe('---');
    expect(lines.slice(0, 4).join(' ')).toContain('alwaysApply: true');
    expect(rule).not.toContain('caliper:start');
    expect(rule).toContain('caliper_ask');
    expect(rule).toContain('caliper trace');
  });
});

describe('vscode', () => {
  // VS Code is the one client that says `servers`; `mcpServers` there installs silently and does
  // nothing at all.
  it('uses the servers key, not mcpServers', () => {
    vscodeAdapter.registerServer(config);
    const written = readJson(join(process.cwd(), '.vscode', 'mcp.json'));
    expect(written).toHaveProperty('servers.caliper.command', 'npx');
    expect(written).not.toHaveProperty('mcpServers');
  });

  it('writes Copilot instructions', () => {
    vscodeAdapter.installGuidance(config);
    const path = join(process.cwd(), '.github', 'copilot-instructions.md');
    expect(readFileSync(path, 'utf8')).toContain('Caliper review');
  });
});

describe('gemini-cli', () => {
  it('registers in the project settings and writes GEMINI.md', () => {
    geminiAdapter.registerServer(config);
    geminiAdapter.installGuidance(config);
    expect(readJson(join(process.cwd(), '.gemini', 'settings.json'))).toHaveProperty(
      'mcpServers.caliper.command',
      'npx',
    );
    expect(readFileSync(join(process.cwd(), 'GEMINI.md'), 'utf8')).toContain('Caliper review');
  });
});

describe('windsurf', () => {
  it('writes its project rule where Windsurf reads rules', () => {
    windsurfAdapter.installGuidance(config);
    const rule = join(process.cwd(), '.windsurf', 'rules', 'caliper.md');
    expect(readFileSync(rule, 'utf8')).toContain('Caliper review');
  });
});

describe('every JSON agent', () => {
  it('leaves what the config file already held alone', () => {
    const path = join(process.cwd(), '.cursor', 'mcp.json');
    cursorAdapter.registerServer(config);
    writeFileSync(path, JSON.stringify({...readJson(path), other: {kept: true}}));

    cursorAdapter.registerServer(config);

    expect(readJson(path)).toHaveProperty('other.kept', true);
    expect(readJson(path)).toHaveProperty('mcpServers.caliper.command', 'npx');
  });

  it('removes its own server entry on uninstall', () => {
    cursorAdapter.registerServer(config);
    cursorAdapter.uninstall({global: false});
    expect(readJson(join(process.cwd(), '.cursor', 'mcp.json'))).not.toHaveProperty(
      'mcpServers.caliper',
    );
  });

  // The instructions file usually belongs to the project, not to Caliper: an uninstall that took the
  // rest of it with it would be worse than never installing.
  it('keeps the project own instructions when Caliper is removed', () => {
    const path = join(process.cwd(), '.github', 'copilot-instructions.md');
    mkdirSync(join(process.cwd(), '.github'), {recursive: true});
    writeFileSync(path, '# House rules\n\nUse tabs.\n');

    vscodeAdapter.installGuidance(config);
    expect(readFileSync(path, 'utf8')).toContain('Caliper review');

    vscodeAdapter.uninstall({global: false});

    const left = readFileSync(path, 'utf8');
    expect(left).toContain('Use tabs.');
    expect(left).not.toContain('Caliper review');
  });

  it('does not leave an empty file behind when the section was all there was', () => {
    geminiAdapter.installGuidance(config);
    geminiAdapter.uninstall({global: false});

    const path = join(process.cwd(), 'GEMINI.md');
    expect(!existsSync(path) || readFileSync(path, 'utf8')).toBeTruthy();
  });
});
