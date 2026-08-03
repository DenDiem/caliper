import type {Anchor, Box, Cover} from '@caliper/core';
import {buildSelector} from '@caliper/core';

const OVERLAY_HOST = '#caliper-overlay-host';
const IGNORED_TAGS = new Set(['HTML', 'BODY']);
const COVER_GRID = 6;
const COVER_LIMIT = 4;

// The tightest element that fully contains the lassoed box — the sensible anchor for "this area",
// so the annotation still carries a real selector. Falls back to the element at the loop's centre.
export const anchorForRegion = (doc: Document, box: Box, fallback: Element | null): Element | null => {
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  for (const element of doc.elementsFromPoint(centreX, centreY)) {
    if (element.closest(OVERLAY_HOST)) continue;
    const rect = element.getBoundingClientRect();
    const contains =
      rect.left <= box.x &&
      rect.top <= box.y &&
      rect.right >= box.x + box.width &&
      rect.bottom >= box.y + box.height;
    if (contains) return element;
  }
  return fallback;
};

const realElementAt = (doc: Document, x: number, y: number): Element | null => {
  for (const element of doc.elementsFromPoint(x, y)) {
    if (element.closest(OVERLAY_HOST)) continue;
    if (IGNORED_TAGS.has(element.tagName)) continue;
    return element;
  }
  return null;
};

const WALK_STEP = 24;

const boxDistance = (rect: DOMRect, box: Box): number => {
  const dx = Math.max(rect.left - (box.x + box.width), box.x - rect.right, 0);
  const dy = Math.max(rect.top - (box.y + box.height), box.y - rect.bottom, 0);
  return Math.hypot(dx, dy);
};

const closestByDistance = (doc: Document, box: Box): Element | null => {
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (element.closest(OVERLAY_HOST)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const distance = boxDistance(rect, box);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = element;
    }
  }
  return best;
};

// The nearest real element to a box that no element encloses — an `add`/area drawn in the empty space
// below the app's content. Prefer the element directly above the box (walk up from its top-centre so
// the mark reads `after → <that element>`); otherwise the closest by rect-distance. Null only when the
// page is truly empty, in which case the caller falls back to <body>.
export const nearestElement = (doc: Document, box: Box): Element | null => {
  const centreX = box.x + box.width / 2;
  for (let y = Math.round(box.y) - 1; y >= 0; y -= WALK_STEP) {
    const element = realElementAt(doc, centreX, y);
    if (element) return element;
  }
  return closestByDistance(doc, box);
};

// Which elements the lassoed area actually sits on, and how much of it each covers — grid-sampled so
// the agent gets `covers: app-recent-activity 0.92, section.stats 0.08` instead of guessing from a
// single derived selector. Coverage is the fraction of the box's area each element is topmost over.
export const coversForBox = (doc: Document, box: Box): Cover[] => {
  const counts = new Map<Element, number>();
  for (let column = 0; column < COVER_GRID; column += 1) {
    for (let row = 0; row < COVER_GRID; row += 1) {
      const x = box.x + (box.width * (column + 0.5)) / COVER_GRID;
      const y = box.y + (box.height * (row + 0.5)) / COVER_GRID;
      const element = realElementAt(doc, x, y);
      if (element) counts.set(element, (counts.get(element) ?? 0) + 1);
    }
  }
  const total = COVER_GRID * COVER_GRID;
  return Array.from(counts, ([element, hits]) => ({
    selector: buildSelector(element).selector,
    coverage: Math.round((hits / total) * 100) / 100,
  }))
    .sort((left, right) => right.coverage - left.coverage)
    .slice(0, COVER_LIMIT);
};

// Where the lassoed box sits relative to its anchor element, so an `add` mark reads as
// "after / before / inside <target>" without the developer's note having to spell it out.
export const anchorRelation = (box: Box, target: Element): Anchor => {
  const rect = target.getBoundingClientRect();
  const EDGE = 2;
  if (box.y >= rect.bottom - EDGE) return 'after';
  if (box.y + box.height <= rect.top + EDGE) return 'before';
  if (box.y <= rect.top + EDGE && box.y + box.height >= rect.bottom - EDGE) return 'replace';
  const boxMid = box.y + box.height / 2;
  const targetMid = rect.top + rect.height / 2;
  return boxMid >= targetMid ? 'inside-end' : 'inside-start';
};
