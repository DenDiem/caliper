import {classifyGesture, collectTokens, elementAt, extractContext, pathBounds} from '@caliper/core';
import type {AnnotationIntent, Box, ElementContext, Point, Region} from '@caliper/core';
import {render} from 'preact';
import {Badge} from './badge';
import {Highlight} from './highlight';
import {createOverlayHost} from './overlay-host';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import {anchorForRegion} from './region';
import {GestureStroke} from './stroke';
import overlayStyles from './overlay.css?inline';

export type {AnnotationDraft};

export interface OverlayOptions {
  onSubmit: (draft: AnnotationDraft) => void;
  capture?: (box: Box) => Promise<string | null>;
  onPick?: (context: ElementContext) => void;
  onExit?: () => void;
}

export interface OverlayHandle {
  destroy(): void;
  setActive(active: boolean): void;
}

interface Pending {
  context: ElementContext;
  intent: AnnotationIntent;
  region: Region | null;
}

const toBox = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
};

const centreOf = (box: Box): {x: number; y: number} => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

const isOverlayEvent = (event: Event): boolean =>
  event.target instanceof Element && event.target.closest('[data-caliper-overlay]') !== null;

// The gesture *is* the mode: a click marks the element, a scribble strikes it out (remove), a loop
// lassos an area. The kind is classified from the drawn path — no mode toolbar to pick first.
export const mountOverlay = ({onSubmit, capture, onPick, onExit}: OverlayOptions): OverlayHandle => {
  const host = createOverlayHost(overlayStyles);
  const container = document.createElement('div');
  host.root.append(container);

  const tokens = collectTokens(document);
  const previousCursor = document.documentElement.style.cursor;
  // Re-anchoring a review zone (onPick) only ever needs an element, so gestures are annotation-only.
  const gesturesEnabled = onPick === undefined;

  let active = true;
  let hovered: {box: Box; label: string | null} | null = null;
  let hoveredElement: Element | null = null;
  let pending: Pending | null = null;
  let screenshot: string | null = null;
  let capturing = false;
  let pointerX = 0;
  let pointerY = 0;
  let frame: number | null = null;
  let strokeFrame: number | null = null;
  let stroke: Point[] | null = null;
  let strokeStrike = false;

  const setCursor = (armed: boolean) => {
    document.documentElement.style.cursor = armed ? 'crosshair' : previousCursor;
  };

  const clearHover = () => {
    hovered = null;
    hoveredElement = null;
  };

  const reset = () => {
    pending = null;
    screenshot = null;
    stroke = null;
    strokeStrike = false;
    clearHover();
    paint();
  };

  const strikeHighlightBox = (): Box | null => {
    if (!stroke || !strokeStrike) return null;
    const box = pathBounds(stroke);
    const centre = centreOf(box);
    const element = elementAt(document, centre.x, centre.y);
    return element ? toBox(element) : box;
  };

  const paint = () => {
    const idle = active && !pending && !capturing && stroke === null;
    const strikeBox = strikeHighlightBox();
    render(
      <>
        {idle ? <Highlight box={hovered?.box ?? null} label={hovered?.label ?? null} /> : null}
        {strikeBox ? <Highlight box={strikeBox} label={null} variant="strike" /> : null}
        {stroke ? <GestureStroke points={stroke} strike={strokeStrike} /> : null}
        {idle ? <Badge /> : null}
        {pending ? (
          <Popover
            context={pending.context}
            region={pending.region}
            intent={pending.intent}
            screenshot={screenshot}
            onSubmit={(draft) => {
              onSubmit({...draft, screenshot});
              reset();
            }}
            onCancel={reset}
          />
        ) : null}
      </>,
      container,
    );
  };

  const updateHover = (force = false) => {
    const element = elementAt(document, pointerX, pointerY);
    if (element === hoveredElement && !force) return;
    hoveredElement = element;
    hovered = element ? {box: toBox(element), label: element.tagName.toLowerCase()} : null;
    paint();
  };

  const schedule = (force = false) => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!active || pending || stroke !== null) return;
      updateHover(force);
    });
  };

  const scheduleStroke = () => {
    if (strokeFrame !== null) return;
    strokeFrame = requestAnimationFrame(() => {
      strokeFrame = null;
      paint();
    });
  };

  const openPending = async (context: ElementContext, intent: AnnotationIntent, region: Region | null) => {
    if (onPick) {
      onPick(context);
      return;
    }
    if (!capture) {
      pending = {context, intent, region};
      clearHover();
      paint();
      return;
    }
    capturing = true;
    clearHover();
    paint();
    screenshot = await capture(region?.box ?? context.box);
    capturing = false;
    pending = {context, intent, region};
    paint();
  };

  const finishGesture = (points: Point[]) => {
    const kind = gesturesEnabled ? classifyGesture(points) : 'pick';

    if (kind === 'pick') {
      const first = points[0] ?? {x: pointerX, y: pointerY};
      const element = elementAt(document, first.x, first.y);
      if (element) void openPending(extractContext(element, tokens), 'change', null);
      else paint();
      return;
    }

    const box = pathBounds(points);
    const centre = centreOf(box);
    const anchor = anchorForRegion(document, box, elementAt(document, centre.x, centre.y));
    if (!anchor) {
      paint();
      return;
    }

    if (kind === 'strike') {
      void openPending(extractContext(anchor, tokens), 'remove', null);
    } else {
      void openPending(extractContext(anchor, tokens), 'change', {box, path: points, enclosedSelectors: []});
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active) return;
    if (stroke) {
      event.preventDefault();
      stroke.push({x: event.clientX, y: event.clientY});
      if (gesturesEnabled) strokeStrike = classifyGesture(stroke) === 'strike';
      scheduleStroke();
      return;
    }
    if (pending) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!active || pending || capturing || event.button !== 0) return;
    if (isOverlayEvent(event)) return;
    event.preventDefault();
    stroke = [{x: event.clientX, y: event.clientY}];
    strokeStrike = false;
    clearHover();
    paint();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (stroke === null) return;
    const points = stroke;
    stroke = null;
    strokeStrike = false;
    event.preventDefault();
    finishGesture(points);
  };

  // Selection happens on pointerup; swallow the page's own click so armed marking never navigates.
  const onClick = (event: MouseEvent) => {
    if (!active || isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onScroll = () => {
    if (!active || pending || stroke !== null) return;
    schedule(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (pending) {
      reset();
      return;
    }
    if (stroke) {
      stroke = null;
      strokeStrike = false;
      paint();
      return;
    }
    active = false;
    clearHover();
    setCursor(false);
    paint();
    onExit?.();
  };

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll, true);

  setCursor(true);
  paint();

  return {
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (strokeFrame !== null) cancelAnimationFrame(strokeFrame);
      frame = null;
      strokeFrame = null;
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll, true);
      setCursor(false);
      render(null, container);
      host.destroy();
    },
    setActive: (next: boolean) => {
      active = next;
      setCursor(next);
      if (!next) {
        clearHover();
        pending = null;
        screenshot = null;
        stroke = null;
        strokeStrike = false;
      }
      paint();
    },
  };
};
