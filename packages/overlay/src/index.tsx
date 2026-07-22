import {collectTokens, elementAt, extractContext} from '@caliper/core';
import type {Box, ElementContext} from '@caliper/core';
import {render} from 'preact';
import {Badge} from './badge';
import {Highlight} from './highlight';
import {createOverlayHost} from './overlay-host';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import overlayStyles from './overlay.css?inline';

export type {AnnotationDraft};

export interface OverlayOptions {
  onSubmit: (draft: AnnotationDraft) => void;
  capture?: (box: Box) => Promise<string | null>;
}

export interface OverlayHandle {
  destroy(): void;
  setActive(active: boolean): void;
}

const toBox = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
};

export const mountOverlay = ({onSubmit, capture}: OverlayOptions): OverlayHandle => {
  const host = createOverlayHost(overlayStyles);
  const container = document.createElement('div');
  host.root.append(container);

  const tokens = collectTokens(document);
  const previousCursor = document.documentElement.style.cursor;

  let active = true;
  let hovered: {box: Box; label: string | null} | null = null;
  let hoveredElement: Element | null = null;
  let selected: ElementContext | null = null;
  let screenshot: string | null = null;
  let capturing = false;
  let pointerX = 0;
  let pointerY = 0;
  let frame: number | null = null;

  const setCursor = (armed: boolean) => {
    document.documentElement.style.cursor = armed ? 'crosshair' : previousCursor;
  };

  const paint = () => {
    render(
      <>
        {selected || capturing ? null : (
          <Highlight box={hovered?.box ?? null} label={hovered?.label ?? null} />
        )}
        {active && !selected && !capturing ? <Badge /> : null}
        {selected ? (
          <Popover
            context={selected}
            screenshot={screenshot}
            onSubmit={(draft) => {
              onSubmit({...draft, screenshot});
              selected = null;
              screenshot = null;
              paint();
            }}
            onCancel={() => {
              selected = null;
              screenshot = null;
              paint();
            }}
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
      if (!active || selected) return;
      updateHover(force);
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active || selected) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule();
  };

  const onScroll = () => {
    if (!active || selected) return;
    schedule(true);
  };

  const select = async (element: Element) => {
    const context = extractContext(element, tokens);

    if (!capture) {
      selected = context;
      hovered = null;
      hoveredElement = null;
      paint();
      return;
    }

    capturing = true;
    hovered = null;
    hoveredElement = null;
    paint();

    screenshot = await capture(context.box);

    capturing = false;
    selected = context;
    paint();
  };

  const onClick = (event: MouseEvent) => {
    if (!active || selected || capturing) return;
    const element = elementAt(document, event.clientX, event.clientY);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    void select(element);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    if (selected) {
      selected = null;
      screenshot = null;
      paint();
      return;
    }

    active = false;
    hovered = null;
    hoveredElement = null;
    setCursor(false);
    paint();
  };

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll, true);

  setCursor(true);
  paint();

  return {
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      document.removeEventListener('pointermove', onPointerMove, true);
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
        hovered = null;
        hoveredElement = null;
        selected = null;
        screenshot = null;
        paint();
      }
    },
  };
};
