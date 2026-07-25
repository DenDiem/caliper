import {batch, computed, effect, signal} from '@preact/signals';
import {extractContext} from '@caliper/core';
import type {Box, ElementContext, ReviewSessionState, ReviewZoneState, TokenMap} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {OverlayHandle} from '@caliper/overlay';
import type {AnswerPopoverProps, HighlightBoxState} from '@caliper/overlay/review';
import {postAnswers, postDraft, postResolve} from './sink';

export interface ReviewOtherPageGroup {
  readonly route: string;
  readonly zones: readonly ReviewZoneState[];
}

export interface ReviewPageGroups {
  readonly onPage: readonly ReviewZoneState[];
  readonly otherPages: readonly ReviewOtherPageGroup[];
}

export interface ReviewClientStore {
  zones: () => ReviewZoneState[];
  boxes: () => HighlightBoxState[];
  pageGroups: () => ReviewPageGroups;
  activeRef: () => string | null;
  hoverRef: () => string | null;
  activePopover: () => AnswerPopoverProps | null;
  draft: (ref: string) => string;
  isResolved: (ref: string) => boolean;
  isSubmitting: () => boolean;
  submitError: () => string | null;
  syncNotice: () => string | null;
  isCollapsed: () => boolean;
  setSyncNotice: (message: string | null) => void;
  setActiveRef: (ref: string | null) => void;
  setHoverRef: (ref: string | null) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDraft: (ref: string, value: string) => void;
  saveDraft: (ref: string) => void;
  submit: () => Promise<void>;
  reanchor: (ref: string) => void;
  hydrate: (state: ReviewSessionState) => void;
  onChange: (listener: () => void) => () => void;
}

const queryOrNull = (selector: string): Element | null => {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
};

const locateElement = (zone: ReviewZoneState): Element | null =>
  queryOrNull(`[data-caliper-ref="${zone.ref}"]`) ?? (zone.selector ? queryOrNull(zone.selector) : null);

const boxOf = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
};

const isOtherPageZone = (zone: ReviewZoneState): zone is ReviewZoneState & {route: string} =>
  zone.route !== null && zone.route !== location.pathname;

const groupOtherPages = (zones: readonly ReviewZoneState[]): ReviewOtherPageGroup[] => {
  const routeOrder: string[] = [];
  const zonesByRoute = new Map<string, ReviewZoneState[]>();

  for (const zone of zones.filter(isOtherPageZone)) {
    const bucket = zonesByRoute.get(zone.route);
    if (bucket) {
      bucket.push(zone);
    } else {
      zonesByRoute.set(zone.route, [zone]);
      routeOrder.push(zone.route);
    }
  }

  return routeOrder.map((route) => ({route, zones: zonesByRoute.get(route) ?? []}));
};

const VIEWPORT_MARGIN_PX = 24;

const isFullyVisible = (rect: DOMRect): boolean =>
  rect.top >= VIEWPORT_MARGIN_PX &&
  rect.left >= VIEWPORT_MARGIN_PX &&
  rect.bottom <= window.innerHeight - VIEWPORT_MARGIN_PX &&
  rect.right <= window.innerWidth - VIEWPORT_MARGIN_PX;

const scrollIntoViewIfNeeded = (element: Element): void => {
  if (isFullyVisible(element.getBoundingClientRect())) return;
  element.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'});
};

export const startController = ({tokens}: {tokens: TokenMap}): ReviewClientStore => {
  const zonesSignal = signal<ReviewZoneState[]>([]);
  const contextsSignal = signal<Record<string, ElementContext>>({});
  const draftsSignal = signal<Record<string, string>>({});
  const activeRefSignal = signal<string | null>(null);
  const hoverRefSignal = signal<string | null>(null);
  const animateQuestionSignal = signal(false);
  const collapsedSignal = signal(false);
  const submittingSignal = signal(false);
  const submitErrorSignal = signal<string | null>(null);
  const syncNoticeSignal = signal<string | null>(null);

  const resolvedElements = new Map<string, Element>();
  const seenPopoverRefs = new Set<string>();
  let pickerHandle: OverlayHandle | null = null;

  const setDraft = (ref: string, value: string): void => {
    draftsSignal.value = {...draftsSignal.value, [ref]: value};
  };

  const setContext = (ref: string, context: ElementContext): void => {
    contextsSignal.value = {...contextsSignal.value, [ref]: context};
  };

  const resolveUnresolvedZones = (): void => {
    for (const zone of zonesSignal.value) {
      const cached = resolvedElements.get(zone.ref);
      if (cached && !cached.isConnected) resolvedElements.delete(zone.ref);
      if (resolvedElements.has(zone.ref)) continue;
      const element = locateElement(zone);
      if (!element) continue;
      resolvedElements.set(zone.ref, element);
      const context = extractContext(element, tokens);
      setContext(zone.ref, context);
      void postResolve(zone.ref, context).catch(() => {});
    }
  };

  const boxChanged = (a: Box, b: Box): boolean =>
    a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;

  const refreshBoxes = (): void => {
    const next = {...contextsSignal.value};
    let changed = false;
    for (const [ref, element] of resolvedElements) {
      const existing = next[ref];
      if (!existing) continue;
      const box = boxOf(element);
      if (!boxChanged(existing.box, box)) continue;
      next[ref] = {...existing, box};
      changed = true;
    }
    if (changed) contextsSignal.value = next;
  };

  const refresh = (): void => {
    resolveUnresolvedZones();
    refreshBoxes();
  };

  // Elements can move without firing a `scroll`/`resize`/mutation event we'd catch (compositor-driven
  // smooth/momentum scrolling dispatches `scroll` a frame or more after the visual position already
  // moved). Re-measuring every animation frame reads the layout the browser is about to paint, so the
  // overlay never trails behind — the same technique libraries like Floating UI use for `autoUpdate`.
  const trackPosition = (): void => {
    refresh();
    requestAnimationFrame(trackPosition);
  };
  requestAnimationFrame(trackPosition);

  const pageGroupsSignal = computed<ReviewPageGroups>(() => {
    const zones = zonesSignal.value;
    return {
      onPage: zones.filter((zone) => !isOtherPageZone(zone)),
      otherPages: groupOtherPages(zones),
    };
  });

  // Numbering must come from the on-page group, not the flat zone list — a zone parked under
  // "Other pages" has no rectangle here, so it can't consume a number that a visible zone needs.
  const boxesSignal = computed<HighlightBoxState[]>(() =>
    pageGroupsSignal.value.onPage.reduce<HighlightBoxState[]>((acc, zone, index) => {
      const context = contextsSignal.value[zone.ref];
      if (context) {
        acc.push({
          ref: zone.ref,
          box: context.box,
          number: index + 1,
          active: zone.ref === activeRefSignal.value,
          hover: zone.ref === hoverRefSignal.value,
        });
      }
      return acc;
    }, []),
  );

  // A click both opens the popover and (if off-screen) smooth-scrolls the element into view. The
  // question types out character-by-character only the first time a zone's popover opens in this
  // session — `seenPopoverRefs` remembers which refs already played the animation.
  const activate = (ref: string | null): void => {
    batch(() => {
      activeRefSignal.value = ref;
      if (ref) {
        animateQuestionSignal.value = !seenPopoverRefs.has(ref);
        seenPopoverRefs.add(ref);
      }
    });
    if (!ref) return;
    const element = resolvedElements.get(ref);
    if (element) scrollIntoViewIfNeeded(element);
  };

  const activePopoverSignal = computed<AnswerPopoverProps | null>(() => {
    const ref = activeRefSignal.value;
    if (!ref) return null;
    const zone = zonesSignal.value.find((item) => item.ref === ref);
    const context = contextsSignal.value[ref];
    if (!zone || !context) return null;
    return {
      zoneRef: ref,
      question: zone.question,
      box: context.box,
      answer: draftsSignal.value[ref] ?? '',
      animateQuestion: animateQuestionSignal.value,
      onInput: (value: string) => setDraft(ref, value),
      onClose: () => activate(null),
    };
  });

  const hydrate = (state: ReviewSessionState): void => {
    zonesSignal.value = state.zones;

    const nextDrafts = {...draftsSignal.value};
    let draftsChanged = false;
    for (const zone of state.zones) {
      if (!(zone.ref in nextDrafts)) {
        nextDrafts[zone.ref] = zone.answer ?? '';
        draftsChanged = true;
      }
    }
    if (draftsChanged) draftsSignal.value = nextDrafts;

    refresh();
  };

  const applyReanchor = (ref: string, context: ElementContext): void => {
    const element = document.querySelector(context.selector);
    setContext(ref, context);
    if (!element) return;
    resolvedElements.set(ref, element);
    void postResolve(ref, context).catch(() => {});
  };

  const reanchor = (ref: string): void => {
    pickerHandle?.destroy();
    pickerHandle = mountOverlay({
      onSubmit: () => {},
      onPick: (context: ElementContext) => {
        applyReanchor(ref, context);
        pickerHandle?.destroy();
        pickerHandle = null;
      },
    });
  };

  const saveDraft = (ref: string): void => {
    void postDraft(ref, draftsSignal.value[ref] ?? '');
  };

  const submit = async (): Promise<void> => {
    submitErrorSignal.value = null;

    const answers = zonesSignal.value
      .map((zone) => ({ref: zone.ref, answer: draftsSignal.value[zone.ref] ?? '', verdict: zone.verdict ?? undefined}))
      .filter((entry) => entry.answer.trim().length > 0);

    if (answers.length === 0) {
      submitErrorSignal.value = 'Answer at least one question before submitting.';
      return;
    }

    submittingSignal.value = true;
    try {
      await postAnswers(answers);
    } catch (error) {
      submitErrorSignal.value = error instanceof Error ? error.message : 'Submit failed';
    } finally {
      submittingSignal.value = false;
    }
  };

  return {
    zones: () => zonesSignal.value,
    boxes: () => boxesSignal.value,
    pageGroups: () => pageGroupsSignal.value,
    activeRef: () => activeRefSignal.value,
    hoverRef: () => hoverRefSignal.value,
    activePopover: () => activePopoverSignal.value,
    draft: (ref) => draftsSignal.value[ref] ?? '',
    isResolved: (ref) => Boolean(contextsSignal.value[ref]),
    isSubmitting: () => submittingSignal.value,
    submitError: () => submitErrorSignal.value,
    syncNotice: () => syncNoticeSignal.value,
    isCollapsed: () => collapsedSignal.value,
    setSyncNotice: (message) => {
      syncNoticeSignal.value = message;
    },
    setActiveRef: activate,
    setHoverRef: (ref) => {
      hoverRefSignal.value = ref;
    },
    setCollapsed: (collapsed) => {
      collapsedSignal.value = collapsed;
    },
    setDraft,
    saveDraft,
    submit,
    reanchor,
    hydrate,
    onChange: (listener) => effect(listener),
  };
};
