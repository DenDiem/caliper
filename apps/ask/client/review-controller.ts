import {batch, computed, effect, signal} from '@preact/signals';
import {extractContext, isSubstantiveText} from '@caliper/core';
import type {Box, ElementContext, ReviewSessionState, ReviewZoneState, TokenMap} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {OverlayHandle} from '@caliper/overlay';
import type {AnswerPopoverProps, HighlightBoxState} from '@caliper/overlay/review';
import {postAnswers, postDraft, postResolve} from './sink';

export interface PageLedgerRow {
  readonly route: string | null;
  readonly total: number;
  readonly answeredCount: number;
  readonly isCurrent: boolean;
}

export interface ReviewProgress {
  readonly answered: number;
  readonly total: number;
}

export type CompletionCardState = {kind: 'page'; route: string; remaining: number} | {kind: 'all'} | null;

export interface ReviewClientStore {
  zones: () => ReviewZoneState[];
  boxes: () => HighlightBoxState[];
  onPageZones: () => ReviewZoneState[];
  pageLedger: () => PageLedgerRow[];
  progress: () => ReviewProgress;
  activeRef: () => string | null;
  hoverRef: () => string | null;
  activePopover: () => AnswerPopoverProps | null;
  completionCard: () => CompletionCardState;
  draft: (ref: string) => string;
  isAnswered: (ref: string) => boolean;
  isResolved: (ref: string) => boolean;
  isSubmitting: () => boolean;
  submitError: () => string | null;
  syncNotice: () => string | null;
  isCollapsed: () => boolean;
  orientationDismissed: () => boolean;
  setSyncNotice: (message: string | null) => void;
  setActiveRef: (ref: string | null) => void;
  setHoverRef: (ref: string | null) => void;
  setCollapsed: (collapsed: boolean) => void;
  setDraft: (ref: string, value: string) => void;
  saveDraft: (ref: string) => void;
  answerAndAdvance: (ref: string) => void;
  dismissCompletionCard: () => void;
  submit: () => Promise<void>;
  reanchor: (ref: string) => void;
  dismissOrientation: () => void;
  autoActivateFirstZoneOnBoot: () => void;
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

const hasAnswer = (draft: string | undefined): boolean => (draft ?? '').trim().length > 0;

const ORIENTATION_DISMISSED_KEY_PREFIX = 'caliper:orientation-dismissed:';

const orientationDismissedKey = (): string => `${ORIENTATION_DISMISSED_KEY_PREFIX}${location.origin}`;

const readOrientationDismissed = (): boolean => {
  try {
    return localStorage.getItem(orientationDismissedKey()) === '1';
  } catch {
    return false;
  }
};

const writeOrientationDismissed = (): void => {
  try {
    localStorage.setItem(orientationDismissedKey(), '1');
  } catch {
    // best-effort only — localStorage may be unavailable (private mode, quota)
  }
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
  const orientationDismissedSignal = signal<boolean>(readOrientationDismissed());
  const completionCardSignal = signal<CompletionCardState>(null);

  const resolvedElements = new Map<string, Element>();
  const seenPopoverRefs = new Set<string>();
  let pickerHandle: OverlayHandle | null = null;
  let autoActivatedOnBoot = false;
  // Set once the content-less-answer warning has been shown; a second Send then goes through, so the
  // warning informs without hard-blocking a deliberate short answer.
  let contentWarningShown = false;

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

  // Capture phase, so this runs before any bubble-phase click handler on the panel/popover itself —
  // a click that lands on our own chrome is excluded outright and never reaches this far down the
  // list of concerns. `composedPath()` (not `event.target`) is required here: the panel and popover
  // render inside a shadow root, and a plain `target.closest(...)` would see only the shadow host
  // once the event is observed from `document`, misreporting every in-popover click as "outside".
  const onDocumentClick = (event: MouseEvent): void => {
    const ref = activeRefSignal.value;
    if (!ref) return;
    const insideChrome = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          (node.matches('.caliper-answer-popover') ||
            node.matches('.caliper-panel') ||
            node.matches('.caliper-panel-tab')),
      );
    if (insideChrome) return;
    closePopover(ref);
  };
  document.addEventListener('click', onDocumentClick, true);

  // Numbering must come from the on-page zones, not the flat zone list — a zone parked on another
  // page has no rectangle here, so it can't consume a number that a visible zone needs.
  const onPageZonesSignal = computed<ReviewZoneState[]>(() =>
    zonesSignal.value.filter((zone) => !isOtherPageZone(zone)),
  );

  const boxesSignal = computed<HighlightBoxState[]>(() =>
    onPageZonesSignal.value.reduce<HighlightBoxState[]>((acc, zone, index) => {
      const context = contextsSignal.value[zone.ref];
      if (context) {
        acc.push({
          ref: zone.ref,
          box: context.box,
          number: index + 1,
          active: zone.ref === activeRefSignal.value,
          hover: zone.ref === hoverRefSignal.value,
          answered: hasAnswer(draftsSignal.value[zone.ref]),
        });
      }
      return acc;
    }, []),
  );

  // One row per distinct route, ordered by first appearance in `zones` — never re-sorted when
  // `location.pathname` changes, so navigating pages doesn't shuffle the ledger underneath the
  // developer. Zones with no route apply to every page and are pinned last as "Anywhere".
  const pageLedgerSignal = computed<PageLedgerRow[]>(() => {
    const zones = zonesSignal.value;
    const drafts = draftsSignal.value;

    const routeOrder: string[] = [];
    const zonesByRoute = new Map<string, ReviewZoneState[]>();
    const anywhereZones: ReviewZoneState[] = [];

    for (const zone of zones) {
      if (zone.route === null) {
        anywhereZones.push(zone);
        continue;
      }
      const bucket = zonesByRoute.get(zone.route);
      if (bucket) {
        bucket.push(zone);
      } else {
        zonesByRoute.set(zone.route, [zone]);
        routeOrder.push(zone.route);
      }
    }

    const rows: PageLedgerRow[] = routeOrder.map((route) => {
      const routeZones = zonesByRoute.get(route) ?? [];
      return {
        route,
        total: routeZones.length,
        answeredCount: routeZones.filter((zone) => hasAnswer(drafts[zone.ref])).length,
        isCurrent: route === location.pathname,
      };
    });

    if (anywhereZones.length > 0) {
      rows.push({
        route: null,
        total: anywhereZones.length,
        answeredCount: anywhereZones.filter((zone) => hasAnswer(drafts[zone.ref])).length,
        isCurrent: false,
      });
    }

    return rows;
  });

  const progressSignal = computed<ReviewProgress>(() => {
    const zones = zonesSignal.value;
    const drafts = draftsSignal.value;
    return {
      answered: zones.filter((zone) => hasAnswer(drafts[zone.ref])).length,
      total: zones.length,
    };
  });

  const saveDraft = (ref: string): void => {
    void postDraft(ref, draftsSignal.value[ref] ?? '');
  };

  // A click both opens the popover and (if off-screen) smooth-scrolls the element into view. The
  // question types out character-by-character only the first time a zone's popover opens in this
  // session — `seenPopoverRefs` remembers which refs already played the animation. Activating any
  // zone (including the one the guided flow lands on next) retires a lingering completion card.
  const activate = (ref: string | null): void => {
    if (ref) completionCardSignal.value = null;
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

  // Candidates are restricted to zones already resolved on screen — an unresolved zone (e.g. one
  // whose selector matches nothing on this page yet) has no box to scroll to or glow, so the guided
  // flow can never land on it. Search forward from `afterRef` in zone order first, then wrap to the
  // start of the page — so repeatedly advancing cycles through every answerable zone exactly once.
  const nextUnansweredOnCurrentPage = (afterRef: string): string | null => {
    const pageZones = onPageZonesSignal.value;
    const isCandidate = (zone: ReviewZoneState): boolean =>
      zone.ref !== afterRef && Boolean(contextsSignal.value[zone.ref]) && !hasAnswer(draftsSignal.value[zone.ref]);

    const afterIndex = pageZones.findIndex((zone) => zone.ref === afterRef);
    const tail = pageZones.slice(afterIndex + 1);
    const head = afterIndex === -1 ? [] : pageZones.slice(0, afterIndex);

    return (tail.find(isCandidate) ?? head.find(isCandidate))?.ref ?? null;
  };

  const buildCompletionCard = (): CompletionCardState => {
    const nextPendingRow = pageLedgerSignal.value.find(
      (row) => row.route !== null && !row.isCurrent && row.answeredCount < row.total,
    );
    if (nextPendingRow && nextPendingRow.route !== null) {
      return {
        kind: 'page',
        route: nextPendingRow.route,
        remaining: nextPendingRow.total - nextPendingRow.answeredCount,
      };
    }
    return {kind: 'all'};
  };

  const closePopover = (ref: string): void => {
    saveDraft(ref);
    activate(null);
  };

  const answerAndAdvance = (ref: string): void => {
    saveDraft(ref);
    const next = nextUnansweredOnCurrentPage(ref);
    if (next) {
      activate(next);
      return;
    }
    activate(null);
    completionCardSignal.value = buildCompletionCard();
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
      isLast: nextUnansweredOnCurrentPage(ref) === null,
      onInput: (value: string) => setDraft(ref, value),
      onClose: () => closePopover(ref),
      onDone: () => answerAndAdvance(ref),
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

  const autoActivateFirstZoneOnBoot = (): void => {
    if (autoActivatedOnBoot) return;
    autoActivatedOnBoot = true;
    if (seenPopoverRefs.size > 0) return;
    const target = onPageZonesSignal.value.find((zone) => resolvedElements.has(zone.ref));
    if (target) activate(target.ref);
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

  const submit = async (): Promise<void> => {
    submitErrorSignal.value = null;

    const answers = zonesSignal.value
      .map((zone) => ({ref: zone.ref, answer: draftsSignal.value[zone.ref] ?? '', verdict: zone.verdict ?? undefined}))
      .filter((entry) => entry.answer.trim().length > 0);

    if (answers.length === 0) {
      submitErrorSignal.value = 'Answer at least one question before submitting.';
      return;
    }

    const flimsy = answers.filter((entry) => !isSubstantiveText(entry.answer));
    if (flimsy.length > 0 && !contentWarningShown) {
      contentWarningShown = true;
      const sample = flimsy[0]?.answer ?? '';
      submitErrorSignal.value =
        `${flimsy.length} answer${flimsy.length === 1 ? '' : 's'} look empty (e.g. "${sample}"). ` +
        'Add real detail, or click Send again to submit as-is.';
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
    onPageZones: () => onPageZonesSignal.value,
    pageLedger: () => pageLedgerSignal.value,
    progress: () => progressSignal.value,
    activeRef: () => activeRefSignal.value,
    hoverRef: () => hoverRefSignal.value,
    activePopover: () => activePopoverSignal.value,
    completionCard: () => completionCardSignal.value,
    draft: (ref) => draftsSignal.value[ref] ?? '',
    isAnswered: (ref) => hasAnswer(draftsSignal.value[ref]),
    isResolved: (ref) => Boolean(contextsSignal.value[ref]),
    isSubmitting: () => submittingSignal.value,
    submitError: () => submitErrorSignal.value,
    syncNotice: () => syncNoticeSignal.value,
    isCollapsed: () => collapsedSignal.value,
    orientationDismissed: () => orientationDismissedSignal.value,
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
    answerAndAdvance,
    dismissCompletionCard: () => {
      completionCardSignal.value = null;
    },
    submit,
    reanchor,
    dismissOrientation: () => {
      orientationDismissedSignal.value = true;
      writeOrientationDismissed();
    },
    autoActivateFirstZoneOnBoot,
    hydrate,
    onChange: (listener) => effect(listener),
  };
};
