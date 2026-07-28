import type {Box} from '@caliper/core';

// The tightest element that fully contains the lassoed box — the sensible anchor for "this area",
// so the annotation still carries a real selector. Falls back to the element at the loop's centre.
export const anchorForRegion = (doc: Document, box: Box, fallback: Element | null): Element | null => {
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;
  for (const element of doc.elementsFromPoint(centreX, centreY)) {
    if (element.closest('#caliper-overlay-host')) continue;
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
