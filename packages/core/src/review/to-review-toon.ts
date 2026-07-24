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

const status = (zone: ReviewZoneState): string => (zone.answered ? 'answered' : 'pending');

export const toReviewToon = (state: ReviewSessionState): string => {
  const header = [
    'review:',
    `  id: ${flat(state.id)}`,
    `  target: ${flat(state.target)}`,
    `  count: ${state.zones.length}`,
  ].join('\n');

  const columns = ['ref', 'route', 'selector', 'question', 'answer', 'verdict', 'status'];
  const rows = state.zones.map((zone) =>
    [
      cell(zone.ref),
      cell(zone.route),
      cell(zone.selector),
      cell(zone.question),
      cell(zone.answer),
      cell(zone.verdict),
      status(zone),
    ].join(','),
  );

  const table = [`zones[${rows.length}]{${columns.join(',')}}:`, ...rows.map((row) => `  ${row}`)].join('\n');

  const help = [
    'help[2]:',
    '  Apply each answer at its selector; a null selector means the zone was not built yet — build it per the answer',
    '  status=pending means the developer has not answered that zone; call caliper_wait again',
  ].join('\n');

  return [header, table, help].join('\n\n');
};
