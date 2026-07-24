#!/usr/bin/env node
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ADAPTERS} from './adapters/index';
import type {AgentAdapter, InstallConfig} from './adapters/index';
import {isLoopbackTarget} from './review-runner';
import {buildSnippetTag, parsePort, SNIPPET_PORT_DEFAULT} from './config';
import type {CaliperMode} from './config';

const DEFAULT_TARGET = 'http://localhost:3000';
const KNOWN_AGENT_IDS = ADAPTERS.map((adapter) => adapter.id).join(', ');

class UsageError extends Error {}

type Command = 'init' | 'uninstall' | 'snippet';

interface ParsedArgs {
  command: Command;
  global: boolean;
  agent: string | null;
  target: string | null;
  mode: string | null;
  port: string | null;
  help: boolean;
}

const INIT_FLAGS = ['--global', '--agent', '--target', '--mode', '--port', '--help', '-h'];
const UNINSTALL_FLAGS = ['--global', '--agent', '--help', '-h'];
const SNIPPET_FLAGS = ['--port', '--help', '-h'];

const isKnownCommand = (value: string): value is Command =>
  value === 'init' || value === 'uninstall' || value === 'snippet';

const flagsForCommand = (command: Command): readonly string[] => {
  if (command === 'init') return INIT_FLAGS;
  if (command === 'uninstall') return UNINSTALL_FLAGS;
  return SNIPPET_FLAGS;
};

const topLevelHelp = (): string =>
  [
    'caliper — install the Caliper agent-review MCP server for your coding agent',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>] [--mode proxy|snippet] [--port <n>]',
    '  caliper uninstall [--global] [--agent <id>]',
    '  caliper snippet [--port <n>]',
    '  caliper --help',
    '',
    `Known agents: ${KNOWN_AGENT_IDS}`,
  ].join('\n');

const initHelp = (): string =>
  [
    'caliper init — register the Caliper MCP server and install agent guidance',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>] [--mode proxy|snippet] [--port <n>]',
    '',
    'Flags:',
    '  --global          Install into the user-global config instead of the current project',
    '  --agent <id>      Install for one agent only (default: every detected agent)',
    '  --target <url>    Loopback dev-server URL to review (default: $CALIPER_TARGET or http://localhost:3000)',
    '  --mode <mode>     "proxy" (default) or "snippet" — see caliper snippet --help for the difference',
    `  --port <n>        Snippet server port, snippet mode only (default: ${SNIPPET_PORT_DEFAULT})`,
    '  --help            Show this help',
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

const snippetHelp = (): string =>
  [
    'caliper snippet — print the <script> tag to add to your app for snippet mode',
    '',
    'Usage:',
    '  caliper snippet [--port <n>]',
    '',
    'Flags:',
    `  --port <n>  Port the snippet server listens on (default: ${SNIPPET_PORT_DEFAULT}); must match ` +
      'CALIPER_PORT / --port used with "caliper init --mode snippet"',
    '  --help      Show this help',
    '',
    'Prints only the script tag, e.g.:',
    `  ${buildSnippetTag(SNIPPET_PORT_DEFAULT)}`,
  ].join('\n');

const helpForCommand = (command: Command): string => {
  if (command === 'init') return initHelp();
  if (command === 'uninstall') return uninstallHelp();
  return snippetHelp();
};

const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const [commandArg, ...rest] = argv;
  if (commandArg === undefined || commandArg === '--help' || commandArg === '-h') {
    console.log(topLevelHelp());
    process.exit(0);
  }
  if (!isKnownCommand(commandArg)) {
    throw new UsageError(`Unknown command "${commandArg}". Run "caliper --help" for usage.`);
  }

  const allowedFlags = flagsForCommand(commandArg);
  const parsed: ParsedArgs = {
    command: commandArg,
    global: false,
    agent: null,
    target: null,
    mode: null,
    port: null,
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
      continue;
    }
    if (flag === '--mode') {
      const value = rest[index + 1];
      if (value === undefined) throw new UsageError('--mode requires a value, e.g. --mode snippet');
      parsed.mode = value;
      index += 1;
      continue;
    }
    if (flag === '--port') {
      const value = rest[index + 1];
      if (value === undefined) throw new UsageError('--port requires a value, e.g. --port 4599');
      parsed.port = value;
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

const resolveMode = (raw: string | null): CaliperMode => {
  if (raw === null) return 'proxy';
  if (raw === 'proxy' || raw === 'snippet') return raw;
  throw new UsageError(`Invalid --mode "${raw}": expected "proxy" or "snippet".`);
};

const resolvePortFlag = (raw: string | null): number => {
  if (raw === null) return SNIPPET_PORT_DEFAULT;
  try {
    return parsePort(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(`Invalid --port: ${message}`);
  }
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

const printSnippetInstructions = (port: number): void => {
  console.log('');
  console.log("Snippet mode needs one script tag in your app's root HTML, e.g. index.html:");
  console.log(`  ${buildSnippetTag(port)}`);
  console.log('Remove it once the review work is done.');
};

const runInit = (args: ParsedArgs): void => {
  const mode = resolveMode(args.mode);
  if (args.port !== null && mode === 'proxy') {
    console.log('Note: --port is ignored in proxy mode (only applies with --mode snippet).');
  }
  const port = mode === 'snippet' ? resolvePortFlag(args.port) : null;
  const config: InstallConfig = {
    serverCommand: resolveServerCommand(),
    target: resolveTarget(args.target),
    mode,
    port,
    global: args.global,
  };
  const adapters = resolveAdapters(args.agent);

  console.log(
    `Installing Caliper for: ${adapters.map((adapter) => adapter.id).join(', ')} ` +
      `(${config.global ? 'global' : 'project'})`,
  );
  console.log(`  server: node ${config.serverCommand}`);
  console.log(`  target: ${config.target}`);
  console.log(`  mode: ${config.mode}`);
  if (config.mode === 'snippet' && config.port !== null) {
    console.log(`  port: ${config.port}`);
  }

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
  if (config.mode === 'snippet' && config.port !== null) {
    printSnippetInstructions(config.port);
  }
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

const runSnippet = (args: ParsedArgs): void => {
  console.log(buildSnippetTag(resolvePortFlag(args.port)));
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpForCommand(args.command));
    return;
  }
  if (args.command === 'init') {
    runInit(args);
  } else if (args.command === 'uninstall') {
    runUninstall(args);
  } else {
    runSnippet(args);
  }
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
