import type {CaliperAnnotation, CaliperSession, Box} from '../schema/annotation.schema';

const ID_LENGTH = 8;
const TEXT_LIMIT = 80;
const NULL = 'null';

const QUOTE_REQUIRED = /[",:|\t]|^\s|\s$/;
const NUMBER_LIKE = /^-?\d+(\.\d+)?$/;

// Properties where a raw value with no token is a defect the agent should fix (a hardcoded colour,
// spacing, font, radius or shadow). Structural properties with no token (display, flex-direction,
// position, computed offsets) carry no design decision, so they are dropped as noise.
const TOKENIZABLE_STYLE = /(^|-)color$|background|box-shadow|border-radius|^padding|^margin|gap$|^font|line-height|letter-spacing/;

const cell = (value: string | null | undefined): string => {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return NULL;
  if (!QUOTE_REQUIRED.test(flat) && !NUMBER_LIKE.test(flat)) return flat;

  const escaped = flat.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
};

const shortId = (id: string): string => id.slice(0, ID_LENGTH);

const truncate = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > TEXT_LIMIT ? `${flat.slice(0, TEXT_LIMIT)}…` : flat;
};

const formatBox = (box: Box): string =>
  `[${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}]`;

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

// One block per mark. `markType` says whether `selector` is a deliberate element or a derived anchor;
// `covers`/`bbox` locate an area; `anchor` gives an `add` its insertion point — so the agent never has
// to guess what a container-level selector really meant.
const annotationBlock = (annotation: CaliperAnnotation, showUrl: boolean): string => {
  const head = [
    shortId(annotation.id),
    annotation.severity,
    annotation.intent,
    annotation.markType,
    cell(annotation.target.selector),
  ].join(' ');
  const lines = [`  ${head}`];

  if (annotation.target.componentName) {
    lines.push(`    component: ${cell(annotation.target.componentName)}`);
  }
  if (showUrl) {
    lines.push(`    url: ${cell(annotation.page.url)}`);
  }
  if (annotation.target.text.trim()) {
    lines.push(`    text: ${cell(truncate(annotation.target.text))}`);
  }
  if (annotation.markType !== 'element') {
    lines.push(`    bbox: ${formatBox(annotation.region?.box ?? annotation.target.box)}`);
  }
  if (annotation.region && annotation.region.covers.length > 0) {
    const covers = annotation.region.covers
      .map((cover) => `${cover.selector} ${Math.round(cover.coverage * 100)}%`)
      .join(', ');
    lines.push(`    covers: ${covers}`);
  }
  if (annotation.intent === 'add' && annotation.anchor && annotation.anchorTarget) {
    lines.push(`    anchor: ${annotation.anchor} → ${cell(annotation.anchorTarget)}`);
  }
  lines.push(`    comment: ${cell(annotation.comment)}`);
  if (annotation.screenshot) {
    lines.push(`    screenshot: ${cell(annotation.screenshot)}`);
  }

  return lines.join('\n');
};

// Styles the agent must act on, keyed by selector (deduped across marks) and never emitted for a
// `remove` mark. Token-matched rows plus hardcodes on tokenizable properties survive; structural
// noise (display, flex-direction, computed offsets) is dropped.
const styleRows = (annotations: readonly CaliperAnnotation[]): string[][] => {
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const annotation of annotations) {
    if (annotation.intent === 'remove') continue;
    const selector = annotation.target.selector;
    if (seen.has(selector)) continue;
    seen.add(selector);
    for (const [property, style] of Object.entries(annotation.target.styles)) {
      if (style.token == null && !TOKENIZABLE_STYLE.test(property)) continue;
      rows.push([cell(selector), property, cell(style.value), cell(style.token), cell(style.tokenMatch)]);
    }
  }
  return rows;
};

const helpLines = (session: CaliperSession, hasScreenshots: boolean): string[] => {
  if (session.annotations.length === 0) {
    return ['Arm the picker with Alt+Shift+C, then click an element to record a defect'];
  }

  const lines = [
    'Each mark: `element` = a chosen element, `area`/`strike` = a derived anchor — for those trust `covers`/`bbox` over `selector`',
    'Match a `styles` token against the design-token variable of the same name before hardcoding a value',
    '`intent: remove` deletes the element; `intent: add` inserts relative to `anchor` (after/before/inside-*/replace) → target',
    'If a mark is ambiguous or its selector is container-level, resolve it with caliper_ask (point on the page), not a chat question',
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
  const first = session.annotations[0];

  const sessionEntries: [string, string][] = [
    ['id', cell(shortId(session.id))],
    ['schemaVersion', String(session.schemaVersion)],
    ['caliperVersion', cell(session.caliperVersion)],
    ['count', String(session.annotations.length)],
  ];

  if (session.annotations.length > 0) {
    sessionEntries.push(['severity', severityBreakdown(session.annotations)]);
  }
  if (first) {
    sessionEntries.push(['viewport', `${first.page.viewport.width}×${first.page.viewport.height}`]);
  }
  if (url) {
    sessionEntries.push(['url', cell(url)]);
  }

  const annotations =
    session.annotations.length === 0
      ? 'annotations: 0 defects recorded in this session'
      : [
          `annotations[${session.annotations.length}]:`,
          ...session.annotations.map((annotation) => annotationBlock(annotation, url === null)),
        ].join('\n');

  const styles = styleRows(session.annotations);
  const sections = [block('session', sessionEntries), annotations];

  if (styles.length > 0) {
    sections.push(table('styles', ['selector', 'property', 'value', 'token', 'match'], styles));
  }

  sections.push(list('help', helpLines(session, hasScreenshots)));

  return sections.join('\n\n');
};
