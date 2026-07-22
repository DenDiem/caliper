import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

const ID_LENGTH = 8;
const NULL = 'null';

const QUOTE_REQUIRED = /[",:|\t]|^\s|\s$/;
const NUMBER_LIKE = /^-?\d+(\.\d+)?$/;

const cell = (value: string | null | undefined): string => {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return NULL;
  if (!QUOTE_REQUIRED.test(flat) && !NUMBER_LIKE.test(flat)) return flat;

  const escaped = flat.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

const shortId = (id: string): string => id.slice(0, ID_LENGTH);

const block = (name: string, entries: readonly (readonly [string, string])[]): string =>
  [`${name}:`, ...entries.map(([key, value]) => `  ${key}: ${value}`)].join('\n');

const table = (name: string, columns: readonly string[], rows: readonly string[][]): string => {
  const header = `${name}[${rows.length}]{${columns.join(',')}}:`;
  return [header, ...rows.map((row) => `  ${row.join(',')}`)].join('\n');
};

const list = (name: string, lines: readonly string[]): string =>
  [`${name}[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join('\n');

const severityBreakdown = (annotations: readonly CaliperAnnotation[]): string => {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    counts.set(annotation.severity, (counts.get(annotation.severity) ?? 0) + 1);
  }
  return Array.from(counts, ([severity, count]) => `${severity}=${count}`).join(' ');
};

const sharedUrl = (annotations: readonly CaliperAnnotation[]): string | null => {
  const first = annotations[0];
  if (!first) return null;
  return annotations.every((item) => item.page.url === first.page.url) ? first.page.url : null;
};

const styleRows = (annotation: CaliperAnnotation): string[][] =>
  Object.entries(annotation.target.styles).map(([property, style]) => [
    shortId(annotation.id),
    property,
    cell(style.value),
    cell(style.token),
    cell(style.tokenMatch),
  ]);

const helpLines = (session: CaliperSession, hasScreenshots: boolean): string[] => {
  if (session.annotations.length === 0) {
    return ['Arm the picker with Alt+Shift+C, then click an element to record a defect'];
  }

  const lines = [
    'Fix each defect at `selector`; `confidence: low` means the selector may not survive a re-render',
    'Match `styles.token` against the design-token variable of the same name before hardcoding a value',
  ];

  if (hasScreenshots) {
    lines.push(
      `Screenshots are omitted here — use Download for caliper-${shortId(session.id)}/<annotation>.png`,
    );
  }

  return lines;
};

export const toToon = (session: CaliperSession): string => {
  const url = sharedUrl(session.annotations);
  const hasScreenshots = session.annotations.some((annotation) => annotation.screenshotId);

  const sessionEntries: [string, string][] = [
    ['id', cell(shortId(session.id))],
    ['schemaVersion', String(session.schemaVersion)],
    ['caliperVersion', cell(session.caliperVersion)],
    ['count', String(session.annotations.length)],
  ];

  if (session.annotations.length > 0) {
    sessionEntries.push(['severity', severityBreakdown(session.annotations)]);
  }
  if (url) {
    sessionEntries.push(['url', cell(url)]);
  }

  const columns = ['id', 'severity', 'component', 'confidence', 'selector', 'comment'];
  if (!url) columns.push('url');

  const rows = session.annotations.map((annotation) => {
    const row = [
      cell(shortId(annotation.id)),
      annotation.severity,
      cell(annotation.target.componentName),
      annotation.target.selectorConfidence,
      cell(annotation.target.selector),
      cell(annotation.comment),
    ];
    if (!url) row.push(cell(annotation.page.url));
    return row;
  });

  const annotations =
    rows.length === 0
      ? 'annotations: 0 defects recorded in this session'
      : table('annotations', columns, rows);

  const styles = session.annotations.flatMap(styleRows);
  const sections = [block('session', sessionEntries), annotations];

  if (styles.length > 0) {
    sections.push(table('styles', ['annotation', 'property', 'value', 'token', 'match'], styles));
  }

  sections.push(list('help', helpLines(session, hasScreenshots)));

  return sections.join('\n\n');
};
