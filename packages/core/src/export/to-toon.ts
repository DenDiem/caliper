import type {CaliperAnnotation, CaliperSession, Box, StyleValue} from '../schema/annotation.schema';

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
  // An area's `text` is its container's text (for a body-anchored area, the whole page) — it
  // contradicts the bbox/covers that actually locate the region, so it is omitted for areas.
  if (annotation.markType !== 'area' && annotation.target.text.trim()) {
    lines.push(`    text: ${cell(truncate(annotation.target.text))}`);
  }
  if (annotation.markType !== 'element') {
    lines.push(`    bbox: ${formatBox(annotation.region?.box ?? annotation.target.box)}`);
  }
  // An area always reports what sits under the loop; an empty list is a real signal ("nothing under
  // the loop"), so it prints `covers: (none)` rather than being suppressed.
  if (annotation.markType === 'area') {
    const covers = annotation.region?.covers ?? [];
    const rendered =
      covers.length > 0
        ? covers.map((cover) => `${cover.selector} ${Math.round(cover.coverage * 100)}%`).join(', ')
        : '(none)';
    lines.push(`    covers: ${rendered}`);
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

const PADDING_SIDES: readonly string[] = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const MARGIN_SIDES: readonly string[] = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];

// Folds four longhand box sides into one shorthand row: a single token when all four share it, else
// the 1-/2-/4-value CSS shorthand string with no token (mixed sides carry no single design decision).
const foldBox = (
  top: StyleValue | undefined,
  right: StyleValue | undefined,
  bottom: StyleValue | undefined,
  left: StyleValue | undefined,
): StyleValue | null => {
  if (!top || !right || !bottom || !left) return null;
  if (top.value === right.value && right.value === bottom.value && bottom.value === left.value) {
    const token = top.token ?? null;
    const sharedToken = [right, bottom, left].every((side) => (side.token ?? null) === token);
    return token !== null && sharedToken
      ? {value: top.value, token, tokenMatch: top.tokenMatch ?? null}
      : {value: top.value};
  }
  const shorthand =
    top.value === bottom.value && right.value === left.value
      ? `${top.value} ${right.value}`
      : `${top.value} ${right.value} ${bottom.value} ${left.value}`;
  return {value: shorthand};
};

// Folds row-gap/column-gap into one `gap` row (single value when equal, `<row> <column>` otherwise).
const foldGap = (row: StyleValue | undefined, column: StyleValue | undefined): StyleValue | null => {
  if (!row || !column) return null;
  if (row.value === column.value) {
    const token = row.token ?? null;
    return token !== null && (column.token ?? null) === token
      ? {value: row.value, token, tokenMatch: row.tokenMatch ?? null}
      : {value: row.value};
  }
  return {value: `${row.value} ${column.value}`};
};

// Rewrites a mark's styles so longhand box/gap sides read as their CSS shorthand, keeping every other
// property in its original position. Consumed longhands collapse onto the first side encountered.
const foldStyles = (styles: Record<string, StyleValue>): [string, StyleValue][] => {
  const padding = foldBox(styles['padding-top'], styles['padding-right'], styles['padding-bottom'], styles['padding-left']);
  const margin = foldBox(styles['margin-top'], styles['margin-right'], styles['margin-bottom'], styles['margin-left']);
  const hasDirectGap = styles['gap'] !== undefined;
  const gap = hasDirectGap ? null : foldGap(styles['row-gap'], styles['column-gap']);

  const consumed = new Set<string>();
  if (padding) for (const side of PADDING_SIDES) consumed.add(side);
  if (margin) for (const side of MARGIN_SIDES) consumed.add(side);
  if (gap || hasDirectGap) {
    consumed.add('row-gap');
    consumed.add('column-gap');
  }

  const emitted = new Set<string>();
  const result: [string, StyleValue][] = [];
  for (const [property, style] of Object.entries(styles)) {
    if (!consumed.has(property)) {
      result.push([property, style]);
      continue;
    }
    if (padding && PADDING_SIDES.includes(property) && !emitted.has('padding')) {
      emitted.add('padding');
      result.push(['padding', padding]);
    } else if (margin && MARGIN_SIDES.includes(property) && !emitted.has('margin')) {
      emitted.add('margin');
      result.push(['margin', margin]);
    } else if (gap && (property === 'row-gap' || property === 'column-gap') && !emitted.has('gap')) {
      emitted.add('gap');
      result.push(['gap', gap]);
    }
  }
  return result;
};

// Styles the agent must act on, keyed by selector (deduped across marks) and emitted only for a
// `change` mark — an added or removed element's current styles are noise. Token-matched rows plus
// hardcodes on tokenizable properties survive; structural noise (display, flex-direction, offsets) drops.
const styleRows = (annotations: readonly CaliperAnnotation[]): string[][] => {
  const seen = new Set<string>();
  const rows: string[][] = [];
  for (const annotation of annotations) {
    if (annotation.intent !== 'change') continue;
    const selector = annotation.target.selector;
    if (seen.has(selector)) continue;
    seen.add(selector);
    for (const [property, style] of foldStyles(annotation.target.styles)) {
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
