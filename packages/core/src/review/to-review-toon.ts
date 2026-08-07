import type {ReviewSessionState, ReviewZoneState} from './session';

const NULL = 'null';
const QUOTE_REQUIRED = /[",:|\t]|^\s|\s$/;
const NUMBER_LIKE = /^-?\d+(\.\d+)?$/;

const flat = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim();

const cell = (value: string | null | undefined): string => {
  const text = flat(value);
  if (!text) return NULL;
  if (!QUOTE_REQUIRED.test(text) && !NUMBER_LIKE.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

const status = (zone: ReviewZoneState, finalized: boolean): string => {
  if (zone.verdict === 'dismissed') return 'dismissed';
  if (zone.answered) return 'answered';
  return finalized ? 'skipped' : 'pending';
};

// The developer resolved this zone on a different route than the agent targeted — a route guard likely
// redirected them, so the answer describes another screen than the one the agent expected to review.
const isRedirected = (zone: ReviewZoneState): boolean =>
  zone.route !== null && zone.resolvedRoute !== null && zone.route !== zone.resolvedRoute;

// The completed review answers, without echoing each zone's question back to the agent (which already
// holds them) — a `{ref, answer, status, route}` table keyed by the ref the agent stamped on the page.
export const toReviewToon = (state: ReviewSessionState): string => {
  const header = [
    'review:',
    `  id: ${flat(state.id)}`,
    `  target: ${flat(state.target)}`,
    `  count: ${state.zones.length}`,
  ].join('\n');

  const columns = ['ref', 'answer', 'status', 'route'];
  const rows = state.zones.map((zone) =>
    [cell(zone.ref), cell(zone.answer), status(zone, state.finalized), cell(zone.resolvedRoute)].join(','),
  );

  const table = [`zones[${rows.length}]{${columns.join(',')}}:`, ...rows.map((row) => `  ${row}`)].join('\n');

  const redirected = state.zones.filter(isRedirected);
  const redirectBlock =
    redirected.length > 0
      ? [
          `redirects[${redirected.length}]:`,
          ...redirected.map(
            (zone) => `  ${flat(zone.ref)}: answered on ${flat(zone.resolvedRoute)}, expected ${flat(zone.route)}`,
          ),
        ].join('\n')
      : null;

  const help = [
    'help[4]:',
    "  Apply each answer at the zone's anchor (the selector you supplied for that ref); you supplied the questions, so they are not echoed",
    '  status=pending means the developer has not answered that zone; call caliper_wait again',
    '  status=skipped means the developer finished the review without answering that zone — treat it as intentionally left, not pending',
    '  route is the page the developer resolved the zone on; a redirects block flags any zone answered on a route other than the one you targeted',
  ].join('\n');

  return [header, table, ...(redirectBlock ? [redirectBlock] : []), help].join('\n\n');
};
