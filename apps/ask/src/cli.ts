#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ADAPTERS, buildServerLaunch} from './adapters/index';
import type {AgentAdapter, InstallConfig} from './adapters/index';
import {isLoopbackTarget} from './review-runner';
import {buildSnippetTag, parsePort, SNIPPET_PORT_DEFAULT} from './config';
import type {CaliperMode} from './config';
import {traceDetailSchema} from '@caliper/core';
import {pullSession} from './jira/pull';
import {readArchive} from './trace/read-archive';
import {ALL_CHANNELS, sliceTrace, type TraceChannel} from './trace/slice';
import {cancel, intro, isCancel, multiselect, outro, select, text} from '@clack/prompts';

const DEFAULT_TARGET = 'http://localhost:3000';
const KNOWN_AGENT_IDS = ADAPTERS.map((adapter) => adapter.id).join(', ');

class UsageError extends Error {}

type Command = 'init' | 'uninstall' | 'snippet' | 'serve' | 'pull' | 'read' | 'trace';

interface ParsedArgs {
  command: Command;
  global: boolean;
  agent: string | null;
  target: string | null;
  mode: string | null;
  port: string | null;
  pinned: boolean;
  help: boolean;
  positional: string | null;
  channels: TraceChannel[];
  around: string | null;
  full: boolean;
}

const INIT_FLAGS = ['--global', '--agent', '--target', '--mode', '--port', '--pinned', '--help', '-h'];
const UNINSTALL_FLAGS = ['--global', '--agent', '--help', '-h'];
const SNIPPET_FLAGS = ['--port', '--help', '-h'];
const SERVE_FLAGS = ['--help', '-h'];
const PULL_FLAGS = ['--help', '-h'];
const READ_FLAGS = ['--help', '-h'];
const TRACE_FLAGS = ['--steps', '--console', '--network', '--state', '--around', '--full', '--help', '-h'];
const POSITIONAL_COMMANDS: readonly Command[] = ['pull', 'read', 'trace'];
const AROUND_WINDOW_MS = 2000;
const MS_PER_SECOND = 1000;

const isKnownCommand = (value: string): value is Command =>
  value === 'init' ||
  value === 'uninstall' ||
  value === 'snippet' ||
  value === 'serve' ||
  value === 'pull' ||
  value === 'read' ||
  value === 'trace';

const flagsForCommand = (command: Command): readonly string[] => {
  if (command === 'init') return INIT_FLAGS;
  if (command === 'uninstall') return UNINSTALL_FLAGS;
  if (command === 'snippet') return SNIPPET_FLAGS;
  if (command === 'pull') return PULL_FLAGS;
  if (command === 'read') return READ_FLAGS;
  if (command === 'trace') return TRACE_FLAGS;
  return SERVE_FLAGS;
};

const topLevelHelp = (): string =>
  [
    'caliper — install the Caliper agent-review MCP server for your coding agent',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>] [--mode proxy|snippet] [--port <n>] [--pinned]',
    '  caliper uninstall [--global] [--agent <id>]',
    '  caliper snippet [--port <n>]',
    '  caliper pull <jira-issue-url|key>',
    '  caliper read <path-to-zip|folder>',
    '  caliper trace <path-to-trace.json> [--steps] [--console] [--network] [--state] [--around <t>] [--full]',
    '  caliper --help',
    '',
    `Known agents: ${KNOWN_AGENT_IDS}`,
    '',
    'caliper serve runs the MCP server over stdio; your coding agent launches it for you.',
    'caliper pull fetches a Caliper QA session attached to a Jira issue and prints it as a TOON work list.',
    'caliper read does the same for an export handed to you directly, with no Jira credentials.',
    'caliper trace opens one recorded bug trace, or a slice of it.',
  ].join('\n');

const initHelp = (): string =>
  [
    'caliper init — register the Caliper MCP server and install agent guidance',
    '',
    'Usage:',
    '  caliper init [--global] [--agent <id>] [--target <url>] [--mode proxy|snippet] [--port <n>] [--pinned]',
    '',
    'Run with no flags in a terminal to choose agents, scope and update mode interactively.',
    '',
    'By default the registered entry auto-updates — it runs `npx -y @dendiem/caliper@latest serve`, so',
    'each agent launch resolves the latest published version (like Playwright). Pass --pinned to lock',
    'this install to `node <path>/dist/server.js` instead (offline / reproducible).',
    '',
    'Flags:',
    '  --global          Install into the user-global config instead of the current project',
    '  --agent <ids>     Install for one or more agents (comma-separated); default: every detected agent',
    '  --target <url>    Loopback dev-server URL to review (default: $CALIPER_TARGET or http://localhost:3000)',
    '  --mode <mode>     "proxy" (default) or "snippet" — see caliper snippet --help for the difference',
    `  --port <n>        Snippet server port, snippet mode only (default: ${SNIPPET_PORT_DEFAULT})`,
    '  --pinned          Pin to this install (node <path>/dist/server.js) instead of auto-updating via npx @latest',
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

const serveHelp = (): string =>
  [
    'caliper serve — run the Caliper MCP server over stdio (machine entrypoint)',
    '',
    'Usage:',
    '  caliper serve',
    '',
    'Your coding agent launches this for you via the entry `caliper init` registered — you rarely',
    'run it by hand. It writes nothing to stdout, which is the MCP stdio channel.',
  ].join('\n');

const pullHelp = (): string =>
  [
    'caliper pull — fetch a Caliper QA session attached to a Jira issue and print it as TOON',
    '',
    'Usage:',
    '  caliper pull <jira-issue-url|key>',
    '',
    'Reads the newest caliper-*.session.json attachment on the issue (added when QA uses "Send to',
    'Jira" from the Caliper extension), materialises its screenshots under .caliper/<id>/, and prints',
    'the review as a TOON work list — the same shape caliper_design returns. No live app is needed.',
    '',
    'Auth (a read-scoped Jira API token is enough — set once per machine):',
    '  CALIPER_JIRA_SITE   your team (e.g. your-team or your-team.atlassian.net)',
    '  CALIPER_JIRA_EMAIL  your Atlassian login email',
    '  CALIPER_JIRA_TOKEN  an API token from https://id.atlassian.com/manage-profile/security/api-tokens',
  ].join('\n');

const readHelp = (): string =>
  [
    'caliper read - read a Caliper QA export handed to you directly (zip or unpacked folder)',
    '',
    'Usage:',
    '  caliper read <path-to-zip|folder>',
    '',
    'Prints the same TOON work list as caliper pull, and materialises any trace files under',
    '.caliper/<id>/ so caliper trace can open them. Use this when QA sent you the archive instead of',
    'filing it to a ticket. No Jira credentials are needed.',
  ].join('\n');

const traceHelp = (): string =>
  [
    'caliper trace - print one bug trace, or a slice of it',
    '',
    'Usage:',
    '  caliper trace <path-to-trace.json> [--steps] [--console] [--network] [--state] [--around <t>] [--full]',
    '',
    '--full adds what the summary lines leave out: request headers and bodies, whole response bodies,',
    'console stack traces, state diffs, and the store snapshots from the ends of the recording. Pair it',
    'with --around or a single channel — on its own it can be very large.',
    '',
    'With no channel flags every channel is printed. Combine flags to narrow it. --around takes a',
    'timestamp from the trace (12400, or 12.4s) and keeps 2s either side of it across every channel -',
    'use it to read the moment a step, error or failed request points at, not the whole recording.',
    '',
    'The video beside a trace is for humans; it carries nothing this command does not.',
  ].join('\n');

const helpForCommand = (command: Command): string => {
  if (command === 'init') return initHelp();
  if (command === 'uninstall') return uninstallHelp();
  if (command === 'snippet') return snippetHelp();
  if (command === 'pull') return pullHelp();
  if (command === 'read') return readHelp();
  if (command === 'trace') return traceHelp();
  return serveHelp();
};

const channelOf = (flag: '--steps' | '--console' | '--network' | '--state'): TraceChannel => {
  if (flag === '--steps') return 'steps';
  if (flag === '--console') return 'console';
  if (flag === '--network') return 'network';
  return 'state';
};

// A trace's own timestamps are milliseconds, but its summary and steps read in seconds. Both
// spellings resolve to the same instant, so the flag matches whatever the agent just read.
const parseTimestamp = (raw: string): number => {
  const seconds = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (seconds) return Math.round(Number(seconds[1]) * MS_PER_SECOND);
  const value = Number(raw);
  if (Number.isFinite(value)) return value;
  throw new UsageError(`Invalid --around "${raw}": expected milliseconds (12400) or seconds (12.4s).`);
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
    pinned: false,
    help: false,
    positional: null,
    channels: [],
    around: null,
    full: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === undefined) continue;
    if (
      POSITIONAL_COMMANDS.includes(parsed.command) &&
      parsed.positional === null &&
      !flag.startsWith('-')
    ) {
      parsed.positional = flag;
      continue;
    }
    if (!allowedFlags.includes(flag)) {
      throw new UsageError(
        `Unknown flag "${flag}" for "caliper ${commandArg}". Valid flags: ${allowedFlags.join(', ')}.`,
      );
    }
    if (flag === '--help' || flag === '-h') {
      parsed.help = true;
      continue;
    }
    if (flag === '--steps' || flag === '--console' || flag === '--network' || flag === '--state') {
      parsed.channels.push(channelOf(flag));
      continue;
    }
    if (flag === '--around') {
      const value = rest[index + 1];
      if (value === undefined) throw new UsageError('--around requires a value, e.g. --around 12.4s');
      parsed.around = value;
      index += 1;
      continue;
    }
    if (flag === '--global') {
      parsed.global = true;
      continue;
    }
    if (flag === '--pinned') {
      parsed.pinned = true;
      continue;
    }
    if (flag === '--full') {
      parsed.full = true;
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

const adapterById = (id: string): AgentAdapter => {
  const adapter = ADAPTERS.find((candidate) => candidate.id === id);
  if (!adapter) throw new UsageError(`Unknown agent "${id}". Known agents: ${KNOWN_AGENT_IDS}.`);
  return adapter;
};

const resolveAdapters = (agentSpec: string | null): readonly AgentAdapter[] => {
  if (agentSpec !== null) {
    const ids = agentSpec
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (ids.length === 0) throw new UsageError('--agent requires at least one agent id.');
    return ids.map(adapterById);
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

interface InstallPlan {
  readonly adapters: readonly AgentAdapter[];
  readonly config: InstallConfig;
}

const isInteractiveTerminal = (): boolean =>
  Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

// Prompt only when nothing was pinned on the command line — any explicit init flag
// means "run me non-interactively", so scripts, CI, and muscle memory keep working.
const shouldPromptInit = (args: ParsedArgs): boolean =>
  isInteractiveTerminal() &&
  args.agent === null &&
  !args.global &&
  args.target === null &&
  args.mode === null &&
  args.port === null &&
  !args.pinned;

const orCancel = <T>(value: T | symbol): T => {
  if (isCancel(value)) {
    cancel('Cancelled — nothing was changed.');
    process.exit(2);
  }
  return value;
};

const planFromFlags = (args: ParsedArgs): InstallPlan => {
  const mode = resolveMode(args.mode);
  if (args.port !== null && mode === 'proxy') {
    console.log('Note: --port is ignored in proxy mode (only applies with --mode snippet).');
  }
  const port = mode === 'snippet' ? resolvePortFlag(args.port) : null;
  return {
    adapters: resolveAdapters(args.agent),
    config: {
      serverCommand: resolveServerCommand(),
      autoUpdate: !args.pinned,
      target: resolveTarget(args.target),
      mode,
      port,
      global: args.global,
    },
  };
};

const promptInitPlan = async (): Promise<InstallPlan> => {
  intro('Caliper — install the review MCP server');

  const detected = new Set(
    ADAPTERS.filter((adapter) => adapter.detect()).map((adapter) => adapter.id),
  );

  const agentIds = orCancel(
    await multiselect({
      message: 'Install for which coding agents?',
      options: ADAPTERS.map((adapter) => ({
        value: adapter.id,
        label: adapter.id,
        hint: detected.has(adapter.id) ? 'detected' : undefined,
      })),
      initialValues: detected.size > 0 ? [...detected] : undefined,
      required: true,
    }),
  );

  const global = orCancel(
    await select({
      message: 'Install scope',
      options: [
        {value: false, label: 'This project', hint: '.mcp.json in the current folder'},
        {value: true, label: 'Global', hint: '~/.claude.json — every project'},
      ],
      initialValue: false,
    }),
  );

  const target = orCancel(
    await text({
      message: 'Dev server URL to review',
      placeholder: DEFAULT_TARGET,
      initialValue: process.env.CALIPER_TARGET ?? DEFAULT_TARGET,
      validate: (value) =>
        typeof value === 'string' && isLoopbackTarget(value)
          ? undefined
          : 'Must be a loopback dev server (localhost / 127.0.0.1 / [::1]).',
    }),
  );

  const autoUpdate = orCancel(
    await select({
      message: 'Update mode',
      options: [
        {value: true, label: 'Auto-update', hint: 'npx @latest — like Playwright'},
        {value: false, label: 'Pinned', hint: 'this install; offline/reproducible'},
      ],
      initialValue: true,
    }),
  );

  outro(`Installing for ${agentIds.join(', ')} (${global ? 'global' : 'project'})`);

  return {
    adapters: agentIds.map(adapterById),
    config: {serverCommand: resolveServerCommand(), autoUpdate, target, mode: 'proxy', port: null, global},
  };
};

const runInit = async (args: ParsedArgs): Promise<void> => {
  const {adapters, config} = shouldPromptInit(args) ? await promptInitPlan() : planFromFlags(args);

  const launch = buildServerLaunch(config);
  console.log(
    `Installing Caliper for: ${adapters.map((adapter) => adapter.id).join(', ')} ` +
      `(${config.global ? 'global' : 'project'})`,
  );
  console.log(
    `  server: ${launch.command} ${launch.args.join(' ')} (${config.autoUpdate ? 'auto-update' : 'pinned'})`,
  );
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

const runPull = async (args: ParsedArgs): Promise<void> => {
  if (args.positional === null) {
    throw new UsageError(
      'caliper pull requires a Jira issue URL or key, e.g. ' +
        'caliper pull https://your-team.atlassian.net/browse/ABC-123',
    );
  }
  console.log(await pullSession(args.positional));
};

const runRead = async (args: ParsedArgs): Promise<void> => {
  if (args.positional === null) {
    throw new UsageError('caliper read requires a path, e.g. caliper read ./caliper-a3f0c1d2.zip');
  }
  console.log(await readArchive(args.positional));
};

const runTrace = (args: ParsedArgs): void => {
  if (args.positional === null) {
    throw new UsageError(
      'caliper trace requires a trace file, e.g. ' +
        'caliper trace .caliper/a3f0c1d2/caliper-a3f0c1d2.trace.json',
    );
  }
  const raw: unknown = JSON.parse(readFileSync(args.positional, 'utf8'));
  const detail = traceDetailSchema.parse(raw);
  const channels = args.channels.length > 0 ? args.channels : ALL_CHANNELS;

  console.log(
    sliceTrace(detail, {
      channels: new Set<TraceChannel>(channels),
      aroundMs: args.around === null ? null : parseTimestamp(args.around),
      windowMs: AROUND_WINDOW_MS,
      full: args.full,
    }),
  );
};

// Machine entrypoint: importing the server module boots it (it connects a stdio transport at the
// top level), which both starts serving and keeps the process alive. Nothing may print to stdout
// here — stdout is the MCP stdio channel.
const runServe = async (): Promise<void> => {
  await import('./server.js');
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpForCommand(args.command));
    return;
  }
  if (args.command === 'init') {
    await runInit(args);
  } else if (args.command === 'uninstall') {
    runUninstall(args);
  } else if (args.command === 'snippet') {
    runSnippet(args);
  } else if (args.command === 'pull') {
    await runPull(args);
  } else if (args.command === 'read') {
    await runRead(args);
  } else if (args.command === 'trace') {
    runTrace(args);
  } else {
    await runServe();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exit(error instanceof UsageError ? 2 : 1);
});
