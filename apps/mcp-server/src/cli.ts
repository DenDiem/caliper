#!/usr/bin/env node
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ADAPTERS} from './adapters/index';
import type {AgentAdapter, InstallConfig} from './adapters/index';
import {isLoopbackTarget} from './review-runner';

const DEFAULT_TARGET = 'http://localhost:3000';
const KNOWN_AGENT_IDS = ADAPTERS.map((adapter) => adapter.id).join(', ');

class UsageError extends Error {}

interface ParsedArgs {
  command: 'init' | 'uninstall';
  global: boolean;
  agent: string | null;
  target: string | null;
  help: boolean;
}

const INIT_FLAGS = ['--global', '--agent', '--target', '--help', '-h'];
const UNINSTALL_FLAGS = ['--global', '--agent', '--help', '-h'];

const isKnownCommand = (value: string): value is 'init' | 'uninstall' =>
  value === 'init' || value === 'uninstall';

const topLevelHelp = (): string =>
  [
    'caliper — install the Caliper agent-review MCP server for your coding agent',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>]',
    '  caliper uninstall [--global] [--agent <id>]',
    '  caliper --help',
    '',
    `Known agents: ${KNOWN_AGENT_IDS}`,
  ].join('\n');

const initHelp = (): string =>
  [
    'caliper init — register the Caliper MCP server and install agent guidance',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>]',
    '',
    'Flags:',
    '  --global        Install into the user-global config instead of the current project',
    '  --agent <id>    Install for one agent only (default: every detected agent)',
    '  --target <url>  Loopback dev-server URL to review (default: $CALIPER_TARGET or http://localhost:3000)',
    '  --help          Show this help',
    '',
    `Known agents: ${KNOWN_AGENT_IDS}`,
  ].join('\n');

const uninstallHelp = (): string =>
  [
    'caliper uninstall — remove the Caliper MCP server registration and installed guidance',
    '',
    'Usage:',
    '  caliper uninstall [--global] [--agent <id>]',
    '',
    'Flags:',
    '  --global      Remove the user-global installation instead of the current project',
    '  --agent <id>  Uninstall one agent only (default: every detected agent)',
    '  --help        Show this help',
    '',
    `Known agents: ${KNOWN_AGENT_IDS}`,
  ].join('\n');

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const [commandArg, ...rest] = argv;
  if (commandArg === undefined || commandArg === '--help' || commandArg === '-h') {
    console.log(topLevelHelp());
    process.exit(0);
  }
  if (!isKnownCommand(commandArg)) {
    throw new UsageError(`Unknown command "${commandArg}". Run "caliper --help" for usage.`);
  }

  const allowedFlags = commandArg === 'init' ? INIT_FLAGS : UNINSTALL_FLAGS;
  const parsed: ParsedArgs = {
    command: commandArg,
    global: false,
    agent: null,
    target: null,
    help: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === undefined) continue;
    if (!allowedFlags.includes(flag)) {
      throw new UsageError(
        `Unknown flag "${flag}" for "caliper ${commandArg}". Valid flags: ${allowedFlags.join(', ')}.`,
      );
    }
    if (flag === '--help' || flag === '-h') {
      parsed.help = true;
      continue;
    }
    if (flag === '--global') {
      parsed.global = true;
      continue;
    }
    if (flag === '--agent') {
      const value = rest[index + 1];
      if (value === undefined)
        throw new UsageError('--agent requires a value, e.g. --agent claude-code');
      parsed.agent = value;
      index += 1;
      continue;
    }
    if (flag === '--target') {
      const value = rest[index + 1];
      if (value === undefined)
        throw new UsageError('--target requires a value, e.g. --target http://127.0.0.1:5599');
      parsed.target = value;
      index += 1;
    }
  }

  return parsed;
};

const resolveServerCommand = (): string => {
  const distDir = dirname(fileURLToPath(import.meta.url));
  return join(distDir, 'server.js');
};

const resolveTarget = (explicit: string | null): string => {
  const target = explicit ?? process.env.CALIPER_TARGET ?? DEFAULT_TARGET;
  if (!isLoopbackTarget(target)) {
    throw new UsageError(
      `Refusing to configure target "${target}": caliper only proxies loopback dev servers ` +
        '(127.0.0.1 / localhost / [::1]). Pass --target http://127.0.0.1:<port> or unset CALIPER_TARGET.',
    );
  }
  return target;
};

const resolveAdapters = (agentId: string | null): readonly AgentAdapter[] => {
  if (agentId !== null) {
    const adapter = ADAPTERS.find((candidate) => candidate.id === agentId);
    if (!adapter)
      throw new UsageError(`Unknown agent "${agentId}". Known agents: ${KNOWN_AGENT_IDS}.`);
    return [adapter];
  }
  const detected = ADAPTERS.filter((candidate) => candidate.detect());
  if (detected.length === 0) {
    throw new Error(
      `No known coding agent detected. Known agents: ${KNOWN_AGENT_IDS}. Pass --agent <id> to install for one explicitly.`,
    );
  }
  return detected;
};

const runInit = (args: ParsedArgs): void => {
  const config: InstallConfig = {
    serverCommand: resolveServerCommand(),
    target: resolveTarget(args.target),
    global: args.global,
  };
  const adapters = resolveAdapters(args.agent);

  console.log(
    `Installing Caliper for: ${adapters.map((adapter) => adapter.id).join(', ')} ` +
      `(${config.global ? 'global' : 'project'})`,
  );
  console.log(`  server: node ${config.serverCommand}`);
  console.log(`  target: ${config.target}`);

  const failed: string[] = [];
  for (const adapter of adapters) {
    console.log(`\n[${adapter.id}]`);
    try {
      adapter.registerServer(config);
      adapter.installGuidance(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  failed: ${message}`);
      failed.push(adapter.id);
    }
  }

  console.log('');
  if (failed.length > 0)
    throw new Error(`Install failed for: ${failed.join(', ')}. See messages above.`);
  console.log(
    'Done. Restart your coding agent so it picks up the new MCP server, then call caliper_ask.',
  );
};

const runUninstall = (args: ParsedArgs): void => {
  const config: Pick<InstallConfig, 'global'> = {global: args.global};
  const adapters = resolveAdapters(args.agent);

  console.log(
    `Uninstalling Caliper for: ${adapters.map((adapter) => adapter.id).join(', ')} ` +
      `(${config.global ? 'global' : 'project'})`,
  );

  const failed: string[] = [];
  for (const adapter of adapters) {
    console.log(`\n[${adapter.id}]`);
    try {
      adapter.uninstall(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  failed: ${message}`);
      failed.push(adapter.id);
    }
  }

  console.log('');
  if (failed.length > 0)
    throw new Error(`Uninstall failed for: ${failed.join(', ')}. See messages above.`);
  console.log('Done.');
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(args.command === 'init' ? initHelp() : uninstallHelp());
    return;
  }
  if (args.command === 'init') {
    runInit(args);
  } else {
    runUninstall(args);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
