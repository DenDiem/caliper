import type {InstallConfig} from './types';

// One source for what every non-Claude-Code agent is told. The trace work updated the Claude skill and
// left the AGENTS.md branch describing a product without traces; with four more agents to serve, the
// only way that does not happen again is for them to share the words.
export const buildGuidanceBody = (config: InstallConfig): string =>
  [
    '## Caliper review',
    '',
    'When you are implementing a design and are genuinely unsure what a UI region should do or look ' +
      'like, call the `caliper_ask` MCP tool so the developer can answer directly in the running page. ' +
      'Anchor each zone with an ordinary CSS selector for an element already on the page — do not edit ' +
      "the app's source to add anchors. Include each zone's route (the path that element is on). A " +
      'review can span multiple pages: the developer navigates the real app, including logging in or ' +
      'working through a flow to reach gated pages, and the questions light up as they get there.',
    `Pinned review target: ${config.target}.`,
    'No reliable selector yet? Ask anyway — the developer can click the region to point at it.',
    'If the result contains status: PENDING, call `caliper_wait` with the returned ticket to keep waiting.',
    '',
    'When the developer says they have marked up / annotated the page, or asks to open "design mode", ' +
      'call the `caliper_design` MCP tool instead — it opens the review window and returns their marks. ' +
      'While the result says status: PENDING, call `caliper_design` again until they submit.',
    '',
    'To review a page behind a route guard (auth / app-state / feature flag), add a `setup` snippet to ' +
      'that zone — JavaScript that puts the app into the state where the guard passes (dispatch the ' +
      'store action / seed the flag), never a bypass. The developer sees it and chooses run-or-skip ' +
      'before it executes, so keep it minimal.',
    '',
    '### Fixing what QA recorded',
    '',
    'A QA session holds two kinds of thing: **marks** (an element and what is wrong with it) and **bug ' +
      'traces** (a recording of a reproduction — steps, DOM, console, network, store actions, and a ' +
      'video). Both arrive the same two ways:',
    '',
    '- filed to a Jira issue → `caliper pull <jira-url|key>`',
    '- handed to you as an archive → `caliper read <path-to-zip|folder>`, which needs no Jira credentials',
    '',
    'Prefix either with `npx -y @dendiem/caliper@latest` if Caliper is not on PATH. Both materialise ' +
      'screenshots and trace files under `.caliper/<id>/` and print a TOON work list — the same shape ' +
      '`caliper_design` returns, so read it the same way. No running app is needed.',
    '',
    'Read a trace by its summary first, then narrow:',
    '',
    '```',
    'caliper trace <file>                        # every channel, summarised',
    'caliper trace <file> --around 12.4s         # 2s either side of a moment',
    'caliper trace <file> --network --full       # + headers, bodies, stacks, state diffs',
    '```',
    '',
    'Every `t` is milliseconds from the trace start, so a step, a console error and a failed request ' +
      'sharing a timestamp are the same instant. **Never open the `.webm`** beside a trace — it is for ' +
      'the human reading the ticket and carries nothing the trace does not.',
    '',
    'Two notes a trace may carry. `truncated` says **which end** is missing — a length limit stops the ' +
      'recording so the end is gone, while a buffer overflow drops the earliest events; read it rather ' +
      'than assuming. `network: fallback` means the debugger could not attach: response bodies are ' +
      'absent, and so is anything sent through `XMLHttpRequest`, so an empty network channel there ' +
      'means "not captured", never "no requests were made".',
    '',
    '`pull` needs a read-scoped Jira token once per machine (CALIPER_JIRA_SITE / CALIPER_JIRA_EMAIL / ' +
      'CALIPER_JIRA_TOKEN); the command prints what to set. It only reads — moving the ticket stays with ' +
      'the developer.',
  ].join('\n');
