import {collectTokens, elementAt, extractContext} from '@caliper/core';
import type {Box, ElementContext} from '@caliper/core';
import {render} from 'preact';
import {Highlight} from './highlight';
import {createOverlayHost} from './overlay-host';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import overlayStyles from './overlay.css?inline';

export type {AnnotationDraft};

export interface OverlayOptions {
  onSubmit: (draft: AnnotationDraft) => void;
}

export interface OverlayHandle {
  destroy(): void;
  setActive(active: boolean): void;
}

export const mountOverlay = ({onSubmit}: OverlayOptions): OverlayHandle => {
  const host = createOverlayHost(overlayStyles);
  const container = document.createElement('div');
  host.root.append(container);

  const tokens = collectTokens(document);
  let active = true;
  let hovered: {box: Box; label: string | null} | null = null;
  let hoveredElement: Element | null = null;
  let selected: ElementContext | null = null;
  let pointerX = 0;
  let pointerY = 0;
  let frame: number | null = null;

  const paint = () => {
    render(
      <>
        <Highlight
          box={selected ? selected.box : (hovered?.box ?? null)}
          label={hovered?.label ?? null}
        />
        {selected ? (
          <Popover
            context={selected}
            onSubmit={(draft) => {
              onSubmit(draft);
              selected = null;
              paint();
            }}
            onCancel={() => {
              selected = null;
              paint();
            }}
          />
        ) : null}
      </>,
      container,
    );
  };

  const updateHover = () => {
    const element = elementAt(document, pointerX, pointerY);
    if (element === hoveredElement) return;

    hoveredElement = element;

    if (!element) {
      hovered = null;
      paint();
      return;
    }

    const rect = element.getBoundingClientRect();
    hovered = {
      box: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      label: element.tagName.toLowerCase(),
    };
    paint();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active || selected) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!active || selected) return;
      updateHover();
    });
  };

  const onClick = (event: MouseEvent) => {
    if (!active || selected) return;
    const element = elementAt(document, event.clientX, event.clientY);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    selected = extractContext(element, tokens);
    hovered = null;
    hoveredElement = null;
    paint();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    selected = null;
    hovered = null;
    hoveredElement = null;
    paint();
  };

  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  paint();

  return {
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      render(null, container);
      host.destroy();
    },
    setActive: (next: boolean) => {
      active = next;
      if (!next) {
        hovered = null;
        hoveredElement = null;
        selected = null;
        paint();
      }
    },
  };
};
