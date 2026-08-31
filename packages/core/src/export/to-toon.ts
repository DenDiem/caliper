import type {CaliperAnnotation, CaliperSession, Box, StyleValue} from '../schema/annotation.schema';
import {combineComponents} from '../tokens/match-token';
import {traceBlock, traceHelpLines} from './trace-toon';

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

const CONTAINER_VIEWPORT_RATIO = 0.8;

interface BlockContext {
  readonly showUrl: boolean;
  // Selectors carried by more than one element mark — those marks get a `bbox` so two picks on the same
  // container-level selector stay distinguishable by location, not only by id and comment text.
  readonly duplicateSelectors: ReadonlySet<string>;
  // Element text already emitted by an earlier mark; a repeat is dropped the way `styles` are deduped,
  // so the same truncated container dump never lands three times.
  readonly seenText: Set<string>;
}

// True when the picked element fills most of the viewport — almost always a mis-click that resolved to a
// page container, not a precise pick. Such a selector must not be trusted as an exact target, and its
// `text` is the whole page rather than anything identifying.
const isContainerLevel = (annotation: CaliperAnnotation): boolean => {
  const {width, height} = annotation.page.viewport;
  const area = width * height;
  if (area <= 0) return false;
  const {box} = annotation.target;
  return (box.width * box.height) / area >= CONTAINER_VIEWPORT_RATIO;
};

const rendersCovers = (annotation: CaliperAnnotation): string => {
  const covers = annotation.region?.covers ?? [];
  return covers.length > 0
    ? covers.map((cover) => `${cover.selector} ${Math.round(cover.coverage * 100)}%`).join(', ')
    : '[]';
};

// An `area` with `covers: []` and no explicit anchor otherwise locates nothing — no target, no position.
// The nearest container the picker recorded as `target.selector` is still a real DOM anchor, so an area
// always gets one: `<anchor> → <target>` when the mark carries them, else `within → <container selector>`.
const areaAnchorLine = (annotation: CaliperAnnotation): string => {
  const position = annotation.anchor ?? 'within';
  const target = annotation.anchorTarget ?? annotation.target.selector;
  return `    anchor: ${position} → ${cell(target)}`;
};

// One block per mark. `markType` says whether `selector` is a deliberate element or a derived anchor;
// `covers`/`bbox` locate an area; `anchor` gives an `add` its insertion point — so the agent never has
// to guess what a container-level selector really meant.
const annotationBlock = (annotation: CaliperAnnotation, context: BlockContext): string => {
  const containerLevel = annotation.markType === 'element' && isContainerLevel(annotation);
  // An area's `selector` is a derived container anchor already carried by `anchor → target`, and it
  // contradicts the "trust covers/bbox over selector" guidance — so it is dropped from an area's header.
  const head = [
    shortId(annotation.id),
    annotation.severity,
    annotation.intent,
    containerLevel ? 'element (container-level)' : annotation.markType,
    ...(annotation.markType === 'area' ? [] : [cell(annotation.target.selector)]),
  ].join(' ');
  const lines = [`  ${head}`];

  if (annotation.target.componentName) {
    lines.push(`    component: ${cell(annotation.target.componentName)}`);
  }
  if (context.showUrl) {
    lines.push(`    url: ${cell(annotation.page.url)}`);
  }
  // An area's `text` is its container's text (for a body-anchored area, the whole page); a container-level
  // element's is likewise the page dump; a truncated value identifies nothing. All three are omitted, and
  // an identical text already shown by an earlier mark is deduped away.
  const rawText = annotation.target.text.trim();
  const isTextNoise = containerLevel || rawText.length > TEXT_LIMIT;
  if (annotation.markType !== 'area' && rawText && !isTextNoise) {
    const text = truncate(rawText);
    if (!context.seenText.has(text)) {
      context.seenText.add(text);
      lines.push(`    text: ${cell(text)}`);
    }
  }
  // Derived marks (area/strike) always locate by box; an element mark only needs one when its selector
  // collides with another mark's — otherwise selector/text/styles already identify it.
  const needsBox =
    annotation.markType !== 'element' || context.duplicateSelectors.has(annotation.target.selector);
  if (needsBox) {
    lines.push(`    bbox: ${formatBox(annotation.region?.box ?? annotation.target.box)}`);
  }
  // An area always reports what sits under the loop; an empty list is a real signal ("nothing under the
  // loop"), so it prints `covers: []`. A strike reports its covers too, but only when it has them —
  // `[]` is not the same conclusive signal there.
  if (annotation.markType === 'area') {
    lines.push(`    covers: ${rendersCovers(annotation)}`);
  } else if (annotation.markType === 'strike' && (annotation.region?.covers?.length ?? 0) > 0) {
    lines.push(`    covers: ${rendersCovers(annotation)}`);
  }
  if (annotation.markType === 'area') {
    lines.push(areaAnchorLine(annotation));
  } else if (annotation.intent === 'add' && annotation.anchor && annotation.anchorTarget) {
    lines.push(`    anchor: ${annotation.anchor} → ${cell(annotation.anchorTarget)}`);
  }
  if (annotation.verdict === 'dismissed') {
    const reason = annotation.dismissReason?.trim();
    lines.push(`    dismissed: ${reason ? cell(reason) : 'true'}`);
  }
  lines.push(`    comment: ${cell(annotation.comment)}`);
  if (annotation.screenshot) {
    lines.push(`    screenshot: ${cell(annotation.screenshot)}`);
  }

  return lines.join('\n');
};

const duplicateElementSelectors = (annotations: readonly CaliperAnnotation[]): Set<string> => {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    if (annotation.markType !== 'element') continue;
    const selector = annotation.target.selector;
    counts.set(selector, (counts.get(selector) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [selector, count] of counts) {
    if (count > 1) duplicates.add(selector);
  }
  return duplicates;
};

const PADDING_SIDES: readonly string[] = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
const MARGIN_SIDES: readonly string[] = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
const BORDER_WIDTH_SIDES: readonly string[] = [
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
];

// Rebuilds the shorthand `token`/`match` from the surviving sides by joining their per-component tokens,
// so a mixed-side shorthand (`padding: 32px 24px`) keeps `--space-5 --space-4` instead of dropping to
// `null` — the same component-wise join the scalar matcher uses, applied here where the sides are folded.
const foldedShorthand = (value: string, sides: readonly StyleValue[]): StyleValue => {
  const {token, tokenMatch} = combineComponents(sides);
  return token !== null ? {value, token, tokenMatch} : {value};
};

// Folds four longhand box sides into one shorthand row: a single token when all four share it, else the
// 1-/2-/4-value CSS shorthand string with its components' tokens joined (`--space-5 --space-4`).
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
  const sides =
    top.value === bottom.value && right.value === left.value ? [top, right] : [top, right, bottom, left];
  return foldedShorthand(sides.map((side) => side.value).join(' '), sides);
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
  return foldedShorthand(`${row.value} ${column.value}`, [row, column]);
};

// collect-styles surfaces one representative border colour (`border-top-color`) for a uniform border;
// left as a longhand it misreads as "only the top border was touched", so it is presented as `border-color`.
const relabel = (property: string): string =>
  property === 'border-top-color' ? 'border-color' : property;

// Rewrites a mark's styles so longhand box/gap/border sides read as their CSS shorthand, keeping every
// other property in its original position. Consumed longhands collapse onto the first side encountered.
const foldStyles = (styles: Record<string, StyleValue>): [string, StyleValue][] => {
  const padding = foldBox(styles['padding-top'], styles['padding-right'], styles['padding-bottom'], styles['padding-left']);
  const margin = foldBox(styles['margin-top'], styles['margin-right'], styles['margin-bottom'], styles['margin-left']);
  const borderWidth = foldBox(
    styles['border-top-width'],
    styles['border-right-width'],
    styles['border-bottom-width'],
    styles['border-left-width'],
  );
  const hasDirectGap = styles['gap'] !== undefined;
  const gap = hasDirectGap ? null : foldGap(styles['row-gap'], styles['column-gap']);

  const consumed = new Set<string>();
  if (padding) for (const side of PADDING_SIDES) consumed.add(side);
  if (margin) for (const side of MARGIN_SIDES) consumed.add(side);
  if (borderWidth) for (const side of BORDER_WIDTH_SIDES) consumed.add(side);
  if (gap || hasDirectGap) {
    consumed.add('row-gap');
    consumed.add('column-gap');
  }

  const emitted = new Set<string>();
  const result: [string, StyleValue][] = [];
  for (const [property, style] of Object.entries(styles)) {
    if (!consumed.has(property)) {
      result.push([relabel(property), style]);
      continue;
    }
    if (padding && PADDING_SIDES.includes(property) && !emitted.has('padding')) {
      emitted.add('padding');
      result.push(['padding', padding]);
    } else if (margin && MARGIN_SIDES.includes(property) && !emitted.has('margin')) {
      emitted.add('margin');
      result.push(['margin', margin]);
    } else if (borderWidth && BORDER_WIDTH_SIDES.includes(property) && !emitted.has('border-width')) {
      emitted.add('border-width');
      result.push(['border-width', borderWidth]);
    } else if (gap && (property === 'row-gap' || property === 'column-gap') && !emitted.has('gap')) {
      emitted.add('gap');
      result.push(['gap', gap]);
    }
  }
  return result;
};

interface StyleEntry {
  readonly scope: 'host' | 'el';
  readonly selector: string;
  readonly property: string;
  readonly style: StyleValue;
}

// Styles the agent must act on, keyed by (scope, selector) and deduped across marks, emitted only for a
// `change` mark — an added or removed element's current styles are noise. Token-matched rows plus
// hardcodes on tokenizable properties survive; structural noise (display, flex-direction, offsets) drops.
// When a mark's picked element sits inside a distinct app-component host, that host's styles are surfaced
// too (scope `host`) — the margin/position/alignment a geometry mark means usually lives there.
const styleEntries = (annotations: readonly CaliperAnnotation[]): StyleEntry[] => {
  const seen = new Set<string>();
  const entries: StyleEntry[] = [];
  const collect = (scope: 'host' | 'el', selector: string, styles: Record<string, StyleValue>): void => {
    const key = `${scope} ${selector}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const [property, style] of foldStyles(styles)) {
      if (style.token == null && !TOKENIZABLE_STYLE.test(property)) continue;
      entries.push({scope, selector, property, style});
    }
  };

  for (const annotation of annotations) {
    if (annotation.intent !== 'change') continue;
    const {selector, hostSelector, hostStyles} = annotation.target;
    if (hostSelector && hostStyles && Object.keys(hostStyles).length > 0) {
      collect('host', hostSelector, hostStyles);
    }
    collect('el', selector, annotation.target.styles);
  }
  return entries;
};

const helpLines = (session: CaliperSession, hasScreenshots: boolean): string[] => {
  if (session.annotations.length === 0 && session.traces.length === 0) {
    return ['Arm the picker with Alt+Shift+C, then click an element to record a defect'];
  }

  const lines = [
    'Each mark: `element` = a chosen element, `area`/`strike` = a derived anchor — for those trust `covers`/`bbox` over `selector`',
    'Match a `styles` token against the design-token variable of the same name before hardcoding a value',
    '`intent: remove` deletes the element; `intent: add` inserts relative to `anchor` (after/before/inside-*/replace) → target',
    'If a mark is ambiguous or its selector is container-level, resolve it with caliper_ask (point on the page), not a chat question',
    'An `area` bbox is where the region sits, not a size to apply — never resize an element to match it',
    '`covers: []` is conclusive: nothing lies under the loop, so read the mark from its `anchor` target',
    'screenshot is a fallback — open it only if selector/text/covers left the mark ambiguous',
  ];

  if (hasScreenshots) {
    lines.push(
      `Screenshots are omitted here — use Download for caliper-${shortId(session.id)}/<annotation>.png`,
    );
  }

  if (session.traces.length > 0) {
    lines.push(...traceHelpLines());
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

  if (session.traces.length > 0) {
    sessionEntries.push(['traces', String(session.traces.length)]);
  }

  if (session.annotations.length > 0) {
    sessionEntries.push(['severity', severityBreakdown(session.annotations)]);
  }
  if (first) {
    sessionEntries.push(['viewport', `${first.page.viewport.width}×${first.page.viewport.height}`]);
  }
  if (url) {
    sessionEntries.push(['url', cell(url)]);
  }

  const blockContext: BlockContext = {
    showUrl: url === null,
    duplicateSelectors: duplicateElementSelectors(session.annotations),
    seenText: new Set<string>(),
  };
  const annotations =
    session.annotations.length === 0
      ? 'annotations: 0 defects recorded in this session'
      : [
          `annotations[${session.annotations.length}]:`,
          ...session.annotations.map((annotation) => annotationBlock(annotation, blockContext)),
        ].join('\n');

  const entries = styleEntries(session.annotations);
  // The `scope` column (host vs el) appears only when a mark contributed host styles, so the common
  // single-element case stays as narrow as before.
  const scoped = entries.some((entry) => entry.scope === 'host');
  const sections = [block('session', sessionEntries), annotations];

  if (session.traces.length > 0) {
    sections.push(
      [`traces[${session.traces.length}]:`, ...session.traces.map(traceBlock)].join('\n'),
    );
  }

  if (entries.length > 0) {
    const columns = scoped
      ? ['scope', 'selector', 'property', 'value', 'token', 'match']
      : ['selector', 'property', 'value', 'token', 'match'];
    const rows = entries.map((entry) => {
      const base = [
        cell(entry.selector),
        entry.property,
        cell(entry.style.value),
        cell(entry.style.token),
        cell(entry.style.tokenMatch),
      ];
      return scoped ? [entry.scope, ...base] : base;
    });
    // Homogeneous scope: state it once so the agent can tell "every row is `el`" from "the column was
    // dropped", instead of the column vanishing silently when no mark contributed host styles.
    const stylesTable = table('styles', columns, rows);
    sections.push(scoped ? stylesTable : `scope: el\n${stylesTable}`);
  }

  sections.push(list('help', helpLines(session, hasScreenshots)));

  return sections.join('\n\n');
};
