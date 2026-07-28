import {collectTokens, elementAt, extractContext, pathBounds} from '@caliper/core';
import type {AnnotationIntent, Box, ElementContext, Point, Region} from '@caliper/core';
import {render} from 'preact';
import {Badge} from './badge';
import {Highlight} from './highlight';
import {LassoPath} from './lasso';
import type {OverlayMode} from './mode';
import {createOverlayHost} from './overlay-host';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import {anchorForRegion} from './region';
import {Toolbar} from './toolbar';
import overlayStyles from './overlay.css?inline';

export type {AnnotationDraft};

export interface OverlayOptions {
  onSubmit: (draft: AnnotationDraft) => void;
  capture?: (box: Box) => Promise<string | null>;
  onPick?: (context: ElementContext) => void;
}

export interface OverlayHandle {
  destroy(): void;
  setActive(active: boolean): void;
}

interface PendingSelection {
  context: ElementContext;
  intent: AnnotationIntent;
  region: Region | null;
}

const MIN_LASSO_SIZE = 12;

const toBox = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
};

const isOverlayEvent = (event: Event): boolean =>
  event.target instanceof Element && event.target.closest('#caliper-overlay-host') !== null;

export const mountOverlay = ({onSubmit, capture, onPick}: OverlayOptions): OverlayHandle => {
  const host = createOverlayHost(overlayStyles);
  const container = document.createElement('div');
  host.root.append(container);

  const tokens = collectTokens(document);
  const previousCursor = document.documentElement.style.cursor;
  // Strike/lasso are annotation gestures; the re-anchor flow (onPick) stays a plain element picker.
  const showToolbar = onPick === undefined;

  let active = true;
  let mode: OverlayMode = 'pick';
  let hovered: {box: Box; label: string | null} | null = null;
  let hoveredElement: Element | null = null;
  let pending: PendingSelection | null = null;
  let screenshot: string | null = null;
  let capturing = false;
  let pointerX = 0;
  let pointerY = 0;
  let frame: number | null = null;
  let lassoFrame: number | null = null;
  let lassoPoints: Point[] | null = null;

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
    lassoPoints = null;
    clearHover();
    paint();
  };

  const setMode = (next: OverlayMode) => {
    mode = next;
    clearHover();
    paint();
  };

  const paint = () => {
    const showHighlight = active && !pending && !capturing && lassoPoints === null && mode !== 'lasso';
    render(
      <>
        {showHighlight ? (
          <Highlight
            box={hovered?.box ?? null}
            label={hovered?.label ?? null}
            variant={mode === 'strike' ? 'strike' : 'default'}
          />
        ) : null}
        {lassoPoints ? <LassoPath points={lassoPoints} /> : null}
        {active && !pending && !capturing ? (
          showToolbar ? (
            <Toolbar mode={mode} onMode={setMode} />
          ) : (
            <Badge />
          )
        ) : null}
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
      if (!active || pending || mode === 'lasso') return;
      updateHover(force);
    });
  };

  const scheduleLasso = () => {
    if (lassoFrame !== null) return;
    lassoFrame = requestAnimationFrame(() => {
      lassoFrame = null;
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

  const finishLasso = (points: Point[]) => {
    const box = pathBounds(points);
    if (box.width < MIN_LASSO_SIZE && box.height < MIN_LASSO_SIZE) {
      paint();
      return;
    }
    const centre = elementAt(document, box.x + box.width / 2, box.y + box.height / 2);
    const anchor = anchorForRegion(document, box, centre);
    if (!anchor) {
      paint();
      return;
    }
    void openPending(extractContext(anchor, tokens), 'change', {box, path: points, enclosedSelectors: []});
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active) return;
    if (lassoPoints) {
      event.preventDefault();
      lassoPoints.push({x: event.clientX, y: event.clientY});
      scheduleLasso();
      return;
    }
    if (pending || mode === 'lasso') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!active || pending || capturing || mode !== 'lasso' || event.button !== 0) return;
    if (isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    lassoPoints = [{x: event.clientX, y: event.clientY}];
    clearHover();
    paint();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (lassoPoints === null) return;
    const points = lassoPoints;
    lassoPoints = null;
    event.preventDefault();
    event.stopPropagation();
    finishLasso(points);
  };

  const onScroll = () => {
    if (!active || pending || mode === 'lasso') return;
    schedule(true);
  };

  const onClick = (event: MouseEvent) => {
    if (!active || pending || capturing || mode === 'lasso') return;
    if (isOverlayEvent(event)) return;
    const element = elementAt(document, event.clientX, event.clientY);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    void openPending(extractContext(element, tokens), mode === 'strike' ? 'remove' : 'change', null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (pending) {
      reset();
      return;
    }
    if (lassoPoints) {
      lassoPoints = null;
      paint();
      return;
    }
    active = false;
    clearHover();
    setCursor(false);
    paint();
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
      if (lassoFrame !== null) cancelAnimationFrame(lassoFrame);
      frame = null;
      lassoFrame = null;
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
        lassoPoints = null;
      }
      paint();
    },
  };
};
