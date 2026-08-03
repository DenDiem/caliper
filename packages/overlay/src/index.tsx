import {classifyGesture, collectTokens, elementAt, extractContext, pathBounds} from '@caliper/core';
import type {Anchor, AnnotationIntent, Box, ElementContext, MarkType, Point, Region} from '@caliper/core';
import {render} from 'preact';
import {Badge} from './badge';
import {FocusCursor} from './focus-cursor';
import {Highlight} from './highlight';
import {Hud} from './hud';
import {createOverlayHost} from './overlay-host';
import {placePopover} from './place-popover';
import {Popover} from './popover';
import type {AnnotationDraft} from './popover';
import {anchorForRegion, anchorRelation, coversForBox, nearestElement} from './region';
import {GestureStroke} from './stroke';
import overlayStyles from './overlay.css?inline';

const POPOVER_SIZE = {width: 372, height: 300};

// Focus-trap enforcer limits: at most REFOCUS_LIMIT re-grabs within REFOCUS_WINDOW_MS.
const REFOCUS_LIMIT = 5;
const REFOCUS_WINDOW_MS = 1000;

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
  setArmed(armed: boolean): void;
}

interface MarkMeta {
  markType: MarkType;
  anchor: Anchor | null;
  anchorTarget: string | null;
}

interface Pending {
  el: Element;
  context: ElementContext;
  intent: AnnotationIntent;
  region: Region | null;
  markType: MarkType;
  anchor: Anchor | null;
  anchorTarget: string | null;
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

// AltGraph (right Alt on many layouts) reports separately from altKey; treat either as "Alt held".
const readAlt = (event: KeyboardEvent | PointerEvent | MouseEvent): boolean =>
  event.altKey || event.getModifierState('AltGraph');

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
  // Review re-anchoring has no Alt-mark concept: it is always effectively armed so a click picks.
  const isReview = !gesturesEnabled;

  let active = true;
  // The base interaction mode. Passive (false, the default) lets clicks reach the app and only marks
  // while Alt is held; armed (true) marks on click and passes clicks through only while Alt is held.
  let armed = false;
  let altHeld = false;
  // Focus-trap enforcer bookkeeping — how many times, and since when, we have re-grabbed the caret.
  let refocusCount = 0;
  let refocusWindowStart = 0;
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
  // The committed mark stays framed on the page (dashed frame + tag + held ink) through capture and
  // the open popover. It re-anchors to its element on every paint (frame + ink shift by how far the
  // element has moved since capture) so it tracks the page as you scroll, instead of floating in the
  // viewport alongside the popover.
  let mark:
    | {el: Element; anchorBox: Box; frameBox: Box; variant: 'strike' | 'area'; stroke: Point[]}
    | null = null;
  // The keyboard-focused element (arrow-key navigation), independent of the mouse hover.
  let focus:
    | {el: Element; tag: string; selector: string; position: {index: number; total: number} | null}
    | null = null;

  // XOR: passive+Alt or armed+no-Alt both mean "marking". Every marking behaviour gates on this, so
  // the overlay is inert (pure passthrough) whenever it is false — it just keeps listening for Alt.
  const effectiveArmed = (): boolean => isReview || armed !== altHeld;
  const marking = (): boolean => active && effectiveArmed();

  const setCursor = (crosshair: boolean) => {
    document.documentElement.style.cursor = crosshair ? 'crosshair' : previousCursor;
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
    mark = null;
    refocusCount = 0;
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

  const markView = (): {box: Box; stroke: Point[]; variant: 'strike' | 'area'} | null => {
    if (!mark) return null;
    const current = toBox(mark.el);
    const dx = current.x - mark.anchorBox.x;
    const dy = current.y - mark.anchorBox.y;
    return {
      box: {
        x: mark.frameBox.x + dx,
        y: mark.frameBox.y + dy,
        width: mark.frameBox.width,
        height: mark.frameBox.height,
      },
      stroke: mark.stroke.map((point) => ({x: point.x + dx, y: point.y + dy})),
      variant: mark.variant,
    };
  };

  const paint = () => {
    const idle = active && effectiveArmed() && !pending && !capturing && stroke === null;
    const strikeBox = strikeHighlightBox();
    const view = markView();
    const pendingBox = pending ? (view?.box ?? toBox(pending.el)) : null;
    const placement = pendingBox
      ? placePopover(pendingBox, POPOVER_SIZE, {width: window.innerWidth, height: window.innerHeight})
      : null;
    const focusView = idle && focus ? {...focus, box: toBox(focus.el)} : null;
    render(
      <>
        {idle ? <Highlight box={hovered?.box ?? null} label={hovered?.label ?? null} /> : null}
        {focusView ? (
          <FocusCursor
            box={focusView.box}
            tag={focusView.tag}
            selector={focusView.selector}
            position={focusView.position}
          />
        ) : null}
        {strikeBox ? <Highlight box={strikeBox} label={null} variant="strike" /> : null}
        {view ? (
          <Highlight
            box={view.box}
            label={view.variant === 'strike' ? 'REMOVE' : 'AREA'}
            variant={view.variant}
          />
        ) : null}
        {stroke ? <GestureStroke points={stroke} strike={strokeStrike} /> : null}
        {view ? <GestureStroke points={view.stroke} strike={view.variant === 'strike'} /> : null}
        {idle ? <Badge armed={armed || isReview} /> : null}
        {idle ? <Hud /> : null}
        {placement?.leader ? (
          <svg class="caliper-leader" width={window.innerWidth} height={window.innerHeight}>
            <line
              x1={placement.leader.x1}
              y1={placement.leader.y1}
              x2={placement.leader.x2}
              y2={placement.leader.y2}
            />
          </svg>
        ) : null}
        {pending && placement ? (
          <Popover
            context={pending.context}
            region={pending.region}
            intent={pending.intent}
            markType={pending.markType}
            anchor={pending.anchor}
            anchorTarget={pending.anchorTarget}
            screenshot={screenshot}
            top={placement.top}
            left={placement.left}
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
      if (!marking() || pending || stroke !== null) return;
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

  // Alt flips the effective mode without any pointer movement, so recompute the highlight and cursor
  // the instant it changes — the mark preview and crosshair must appear/vanish under a stationary mouse.
  const syncAlt = (next: boolean) => {
    if (altHeld === next) return;
    altHeld = next;
    const live = marking();
    setCursor(live);
    if (live && !pending && stroke === null) {
      updateHover(true);
      return;
    }
    clearHover();
    paint();
  };

  const openPending = async (
    el: Element,
    context: ElementContext,
    intent: AnnotationIntent,
    region: Region | null,
    meta: MarkMeta,
  ) => {
    if (onPick) {
      onPick(context);
      return;
    }
    if (!capture) {
      pending = {el, context, intent, region, ...meta};
      clearHover();
      paint();
      return;
    }
    capturing = true;
    clearHover();
    paint();
    // Hide the overlay for the capture frame so the mark's own frame/ink isn't baked into the crop;
    // one rAF lets the hidden state paint before captureVisibleTab reads the pixels.
    host.setHidden(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    screenshot = await capture(region?.box ?? context.box);
    host.setHidden(false);
    capturing = false;
    pending = {el, context, intent, region, ...meta};
    paint();
  };

  const finishGesture = (points: Point[]) => {
    const kind = gesturesEnabled ? classifyGesture(points) : 'pick';
    mark = null;

    if (kind === 'pick') {
      const first = points[0] ?? {x: pointerX, y: pointerY};
      const element = elementAt(document, first.x, first.y);
      if (element)
        void openPending(element, extractContext(element, tokens), 'change', null, {
          markType: 'element',
          anchor: null,
          anchorTarget: null,
        });
      else paint();
      return;
    }

    const box = pathBounds(points);
    const centre = centreOf(box);
    const contained = anchorForRegion(document, box, elementAt(document, centre.x, centre.y));

    if (kind === 'strike') {
      if (!contained) {
        paint();
        return;
      }
      const anchorBox = toBox(contained);
      mark = {el: contained, anchorBox, frameBox: anchorBox, variant: 'strike', stroke: points};
      void openPending(contained, extractContext(contained, tokens), 'remove', null, {
        markType: 'strike',
        anchor: null,
        anchorTarget: null,
      });
      return;
    }

    // An area is defined by its lassoed box, not a single element. When nothing encloses the loop
    // — drawing over empty space below the app's own content — anchor to the nearest real element
    // (usually the landmark directly above) so the mark keeps a real selector and an `after` relation,
    // falling back to <body> only when the page is truly empty.
    const areaAnchor = contained ?? nearestElement(document, box) ?? document.body;
    const anchorBox = toBox(areaAnchor);
    mark = {el: areaAnchor, anchorBox, frameBox: box, variant: 'area', stroke: points};
    const context = extractContext(areaAnchor, tokens);
    void openPending(areaAnchor, context, 'change', {box, path: points, covers: coversForBox(document, box)}, {
      markType: 'area',
      anchor: anchorRelation(box, areaAnchor),
      anchorTarget: context.selector,
    });
  };

  const isCaliperEl = (element: Element | null): boolean =>
    !!element && element.closest('[data-caliper-overlay]') !== null;

  const editableFocused = (): boolean => {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    );
  };

  const siblingPosition = (element: Element): {index: number; total: number} | null => {
    const parent = element.parentElement;
    if (!parent) return null;
    const siblings = Array.from(parent.children).filter((child) => !isCaliperEl(child));
    const index = siblings.indexOf(element);
    return index >= 0 ? {index: index + 1, total: siblings.length} : null;
  };

  const focusOn = (element: Element) => {
    focus = {
      el: element,
      tag: element.tagName.toLowerCase(),
      selector: extractContext(element, tokens).selector,
      position: siblingPosition(element),
    };
    element.scrollIntoView({block: 'nearest', inline: 'nearest'});
    paint();
  };

  const navigateFocus = (key: string) => {
    const current = focus?.el ?? hoveredElement ?? document.body;
    const next =
      key === 'ArrowUp'
        ? current.parentElement
        : key === 'ArrowDown'
          ? current.firstElementChild
          : key === 'ArrowLeft'
            ? current.previousElementSibling
            : current.nextElementSibling;
    if (next && !isCaliperEl(next)) focusOn(next);
  };

  // M / X / A mark the keyboard-focused element with the same three intents as click / scribble / loop.
  const markFocused = (variant: 'change' | 'remove' | 'area') => {
    if (!focus || pending) return;
    const element = focus.el;
    const context = extractContext(element, tokens);
    const box = toBox(element);
    focus = null;
    mark = null;
    if (variant === 'remove') {
      mark = {el: element, anchorBox: box, frameBox: box, variant: 'strike', stroke: []};
      void openPending(element, context, 'remove', null, {
        markType: 'element',
        anchor: null,
        anchorTarget: null,
      });
    } else if (variant === 'area') {
      const path: Point[] = [
        {x: box.x, y: box.y},
        {x: box.x + box.width, y: box.y},
        {x: box.x + box.width, y: box.y + box.height},
        {x: box.x, y: box.y + box.height},
        {x: box.x, y: box.y},
      ];
      mark = {el: element, anchorBox: box, frameBox: box, variant: 'area', stroke: []};
      void openPending(element, context, 'change', {box, path, covers: coversForBox(document, box)}, {
        markType: 'area',
        anchor: null,
        anchorTarget: null,
      });
    } else {
      void openPending(element, context, 'change', null, {
        markType: 'element',
        anchor: null,
        anchorTarget: null,
      });
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!active) return;
    syncAlt(readAlt(event));
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
    syncAlt(readAlt(event));
    if (!marking() || pending || capturing || event.button !== 0) return;
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

  // Selection happens on pointerup; swallow the page's own click so marking never navigates. When the
  // overlay is inert (passive without Alt, or armed with Alt held) the click falls through to the app.
  const onClick = (event: MouseEvent) => {
    syncAlt(readAlt(event));
    if (!marking() || isOverlayEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const isTyping = (): boolean => {
    const focused = host.root.activeElement;
    return focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement;
  };

  const onScroll = () => {
    if (!active) return;
    // Re-anchor the held mark and reposition the popover as the page moves — but freeze while the
    // reviewer is typing a note so the popover never jumps out from under the cursor.
    if (pending || mark) {
      if (!isTyping()) scheduleStroke();
      return;
    }
    if (stroke !== null) return;
    schedule(true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    syncAlt(readAlt(event));
    if (event.key === 'Escape') {
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
      focus = null;
      clearHover();
      setCursor(false);
      paint();
      onExit?.();
      return;
    }

    // Keyboard marking: only while effectively armed and idle, never over the popover or a page input.
    if (!gesturesEnabled || !marking() || pending || stroke !== null) return;
    if (isOverlayEvent(event) || editableFocused()) return;

    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      navigateFocus(event.key);
      return;
    }

    const key = event.key.toLowerCase();
    if ((key === 'm' || key === 'x' || key === 'a') && focus) {
      event.preventDefault();
      markFocused(key === 'x' ? 'remove' : key === 'a' ? 'area' : 'change');
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    syncAlt(readAlt(event));
  };

  // Alt released while the window is blurred (Alt-Tab away) fires no keyup here, so it would stick on.
  const onWindowBlur = () => {
    syncAlt(false);
  };

  const overlayContains = (node: EventTarget | null): boolean =>
    node instanceof Element && node.closest('[data-caliper-overlay]') !== null;

  // Apps whose modals trap focus (Bootstrap _enforceFocus, CDK / focus-trap, hand-rolled) yank focus
  // back into the modal the instant it lands outside. The popover lives in a shadow host on <html> —
  // always "outside" — so its note field would lose the caret the moment it gained it. Two defences:
  //
  // 1. Capture-phase swallow: stop the focus event before the app's enforcer can see it — both when
  //    focus LANDS on our host (focusin/focus target = host) and when it MOVES TO it from the modal
  //    (focusout whose relatedTarget = host, how a trap that re-focuses on its own focusout steals it).
  // 2. Active enforcer: a trap inside a shadow root (Ionic `ion-modal`) never surfaces to (1). While a
  //    popover is open, if focus is pulled OUT of our field to a non-overlay target, put it back next
  //    frame. `refocusCount` caps the fight so a trap that re-steals can't spin an infinite focus war
  //    and hang the tab — a couple of flickers are acceptable, a freeze is not. Best-effort; a live
  //    modal is needed to confirm it, so this is unverifiable in a headless build.
  const focusTargetsOverlay = (event: FocusEvent): boolean =>
    isOverlayEvent(event) || overlayContains(event.relatedTarget);

  const requestRefocus = () => {
    const now = Date.now();
    if (now - refocusWindowStart > REFOCUS_WINDOW_MS) {
      refocusWindowStart = now;
      refocusCount = 0;
    }
    if (refocusCount >= REFOCUS_LIMIT) return;
    refocusCount += 1;
    requestAnimationFrame(() => {
      if (!pending) return;
      const field = host.root.querySelector('.caliper-pop__text');
      if (field instanceof HTMLElement) field.focus();
    });
  };

  const onFocusCapture = (event: FocusEvent) => {
    if (!focusTargetsOverlay(event)) return;
    event.stopImmediatePropagation();
    if (
      pending &&
      event.type === 'focusout' &&
      isOverlayEvent(event) &&
      !overlayContains(event.relatedTarget)
    ) {
      requestRefocus();
    }
  };

  document.addEventListener('focusin', onFocusCapture, true);
  document.addEventListener('focusout', onFocusCapture, true);
  document.addEventListener('focus', onFocusCapture, true);
  document.addEventListener('pointermove', onPointerMove, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll, true);
  window.addEventListener('blur', onWindowBlur);

  setCursor(marking());
  paint();

  return {
    destroy: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (strokeFrame !== null) cancelAnimationFrame(strokeFrame);
      frame = null;
      strokeFrame = null;
      document.removeEventListener('focusin', onFocusCapture, true);
      document.removeEventListener('focusout', onFocusCapture, true);
      document.removeEventListener('focus', onFocusCapture, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll, true);
      window.removeEventListener('blur', onWindowBlur);
      setCursor(false);
      render(null, container);
      host.destroy();
    },
    setActive: (next: boolean) => {
      active = next;
      setCursor(marking());
      if (!next) {
        clearHover();
        pending = null;
        screenshot = null;
        stroke = null;
        strokeStrike = false;
        mark = null;
        focus = null;
      }
      paint();
    },
    setArmed: (next: boolean) => {
      armed = next;
      setCursor(marking());
      clearHover();
      paint();
    },
  };
};
