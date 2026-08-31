import type {CaliperTrace, TraceTruncation} from '../schema/trace.schema';

const ID_LENGTH = 8;
const MS_PER_SECOND = 1000;

const seconds = (ms: number): string => `${(ms / MS_PER_SECOND).toFixed(1)}s`;

const TRUNCATION: Record<TraceTruncation, string> = {
  'length-limit':
    'the recording hit its length limit and was stopped — the END of the reproduction is missing, the start is intact',
  'buffer-overflow':
    'a collector buffer overflowed — the EARLIEST events were dropped, the end is intact',
  'video-window': 'the video kept only its final seconds — the trace channels themselves are complete',
};

// A trace recorded before the cause was distinguished says only that something was lost, which is the
// honest thing to say about it.
export const truncationNote = (trace: CaliperTrace): string =>
  trace.truncatedBy
    ? TRUNCATION[trace.truncatedBy]
    : 'the recording was cut short — which end is missing was not recorded';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const summaryLine = (trace: CaliperTrace): string => {
  const {steps, consoleErrors, failedRequests, stateActions} = trace.summary;
  return [
    plural(steps, 'step'),
    plural(consoleErrors, 'console error'),
    plural(failedRequests, 'failed request'),
    plural(stateActions, 'state action'),
  ].join(', ');
};

// One block per trace: enough for the agent to decide whether this trace explains the bug, and the
// filename to open when it does. The channels stay on disk — a 30-second trace carrying response
// bodies would consume the context before the ticket has been read.
export const traceBlock = (trace: CaliperTrace): string => {
  const lines = [
    `  ${trace.id.slice(0, ID_LENGTH)} ${seconds(trace.durationMs)} "${trace.label}"`,
    `    url: ${trace.page.url}`,
    `    summary: ${summaryLine(trace)}`,
    `    trace: ${trace.files.trace}`,
  ];

  if (trace.files.replay) lines.push(`    replay: ${trace.files.replay}`);
  if (trace.truncated) {
    lines.push(`    truncated: ${truncationNote(trace)}`);
  }
  if (trace.sources.network === 'fallback') {
    lines.push(
      '    note: network captured in fallback mode — request/response bodies may be missing',
    );
  }
  if (trace.summary.stateActions === 0) {
    lines.push(
      '    note: no store actions in this window — either the app dispatched none, or it uses no Redux/NgRx devtools hook',
    );
  }

  return lines.join('\n');
};

export const traceHelpLines = (): readonly string[] => [
  'A trace is a recorded reproduction: read its steps in order, then correlate console/network by their `t` (ms from trace start)',
  'Open a trace with `caliper trace <file>`; narrow it with --network / --console / --state / --around <t> instead of reading it whole',
  'The .webm beside a trace is for humans — never open it, it carries nothing the trace does not',
];
