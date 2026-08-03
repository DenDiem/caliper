const IGNORED_TAGS: ReadonlySet<string> = new Set(['html', 'body']);

// Overlay content is often pointer-events:none (menus, selects, tooltips, dropdowns). elementFromPoint
// skips pointer-events:none, so it reports the element *under* such an overlay — the picker then marks
// the wrong node. The pane (not the backdrop — that would swallow every outside point) is hit-tested
// geometrically instead. Matches Angular CDK / Material overlays.
const OVERLAY_PANE = '.cdk-overlay-pane';

const contains = (rect: DOMRect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const isVisible = (el: Element): boolean => {
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const isCaliper = (el: Element): boolean => el.closest('[data-caliper-overlay]') !== null;

// document.elementFromPoint stops at the first shadow host — over a web component (ion-modal, any
// custom element with a shadow root) it returns the host, not the real element under the cursor.
// Descend open shadow roots at the same point so marking works inside component-heavy modals.
const pierce = (root: Document | ShadowRoot, x: number, y: number): Element | null => {
  const found = root.elementFromPoint(x, y);
  if (found?.shadowRoot) {
    const deeper = pierce(found.shadowRoot, x, y);
    if (deeper) return deeper;
  }
  return found;
};

// Deepest visible descendant of `root` whose box contains the point — geometry only, so it sees
// through pointer-events:none. Walks last-child-first (topmost paint order for in-flow content).
const deepestWithin = (root: Element, x: number, y: number): Element => {
  let node = root;
  for (;;) {
    const children = node.children;
    let next: Element | null = null;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child && !isCaliper(child) && isVisible(child) && contains(child.getBoundingClientRect(), x, y)) {
        next = child;
        break;
      }
    }
    if (!next) return node;
    node = next;
  }
};

// An overlay pane that covers the point but which elementFromPoint missed (its content is
// pointer-events:none). Only used when the direct hit landed outside any overlay layer, so a normal
// pointer-events:auto overlay — already reported correctly — is never second-guessed.
const overlayAt = (doc: Document, x: number, y: number): Element | null => {
  const panes = doc.querySelectorAll(OVERLAY_PANE);
  for (let index = panes.length - 1; index >= 0; index -= 1) {
    const pane = panes[index];
    if (pane && isVisible(pane) && contains(pane.getBoundingClientRect(), x, y)) return deepestWithin(pane, x, y);
  }
  return null;
};

export const elementAt = (doc: Document, x: number, y: number): Element | null => {
  // An overlay pane covering the point wins: it is painted on top, and geometry finds its real
  // content element even when elementFromPoint would skip past it (pointer-events:none) or stop on
  // the bare pane wrapper (pointer-events:auto pane, none content). No pane → normal hit-testing.
  const found = overlayAt(doc, x, y) ?? pierce(doc, x, y);
  if (!found) return null;
  if (IGNORED_TAGS.has(found.tagName.toLowerCase())) return null;
  return found;
};
