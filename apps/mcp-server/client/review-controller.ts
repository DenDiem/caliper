import {computed, effect, signal} from '@preact/signals';
import {extractContext} from '@caliper/core';
import type {Box, ElementContext, ReviewSessionState, ReviewZoneState, TokenMap} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {AnnotationDraft, OverlayHandle} from '@caliper/overlay';
import type {AnswerPopoverProps} from '@caliper/overlay/review';
import {postAnswers, postDraft} from './sink';

export interface ReviewClientStore {
  zones: () => ReviewZoneState[];
  boxes: () => {ref: string; box: Box; active: boolean}[];
  activeRef: () => string | null;
  activePopover: () => AnswerPopoverProps | null;
  draft: (ref: string) => string;
  isResolved: (ref: string) => boolean;
  isSubmitting: () => boolean;
  setActiveRef: (ref: string | null) => void;
  setDraft: (ref: string, value: string) => void;
  saveDraft: (ref: string) => void;
  submit: () => Promise<void>;
  reanchor: (ref: string) => void;
  hydrate: (state: ReviewSessionState) => void;
  onChange: (listener: () => void) => () => void;
}

const locateElement = (zone: ReviewZoneState): Element | null =>
  document.querySelector(`[data-caliper-ref="${zone.ref}"]`) ??
  (zone.selector ? document.querySelector(zone.selector) : null);

const boxOf = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
};

export const startController = ({tokens}: {tokens: TokenMap}): ReviewClientStore => {
  const zonesSignal = signal<ReviewZoneState[]>([]);
  const contextsSignal = signal<Record<string, ElementContext>>({});
  const draftsSignal = signal<Record<string, string>>({});
  const activeRefSignal = signal<string | null>(null);
  const submittingSignal = signal(false);

  const resolvedElements = new Map<string, Element>();
  let pickerHandle: OverlayHandle | null = null;
  let refreshScheduled = false;

  const setDraft = (ref: string, value: string): void => {
    draftsSignal.value = {...draftsSignal.value, [ref]: value};
  };

  const setContext = (ref: string, context: ElementContext): void => {
    contextsSignal.value = {...contextsSignal.value, [ref]: context};
  };

  const resolveUnresolvedZones = (): void => {
    for (const zone of zonesSignal.value) {
      if (resolvedElements.has(zone.ref)) continue;
      const element = locateElement(zone);
      if (!element) continue;
      resolvedElements.set(zone.ref, element);
      setContext(zone.ref, extractContext(element, tokens));
    }
  };

  const refreshBoxes = (): void => {
    const next = {...contextsSignal.value};
    let changed = false;
    for (const [ref, element] of resolvedElements) {
      const existing = next[ref];
      if (!existing) continue;
      next[ref] = {...existing, box: boxOf(element)};
      changed = true;
    }
    if (changed) contextsSignal.value = next;
  };

  const refresh = (): void => {
    resolveUnresolvedZones();
    refreshBoxes();
  };

  const scheduleRefresh = (): void => {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      refresh();
    });
  };

  const observer = new MutationObserver(() => scheduleRefresh());
  observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true});
  document.addEventListener('scroll', scheduleRefresh, true);
  window.addEventListener('resize', scheduleRefresh);

  const boxesSignal = computed(() =>
    zonesSignal.value.reduce<{ref: string; box: Box; active: boolean}[]>((acc, zone) => {
      const context = contextsSignal.value[zone.ref];
      if (context) acc.push({ref: zone.ref, box: context.box, active: zone.ref === activeRefSignal.value});
      return acc;
    }, []),
  );

  const activePopoverSignal = computed<AnswerPopoverProps | null>(() => {
    const ref = activeRefSignal.value;
    if (!ref) return null;
    const zone = zonesSignal.value.find((item) => item.ref === ref);
    const context = contextsSignal.value[ref];
    if (!zone || !context) return null;
    return {
      ref,
      question: zone.question,
      box: context.box,
      answer: draftsSignal.value[ref] ?? '',
      onInput: (value: string) => setDraft(ref, value),
      onClose: () => {
        activeRefSignal.value = null;
      },
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
    if (element) resolvedElements.set(ref, element);
    setContext(ref, context);
  };

  const reanchor = (ref: string): void => {
    pickerHandle?.destroy();
    pickerHandle = mountOverlay({
      onSubmit: (draft: AnnotationDraft) => {
        applyReanchor(ref, draft.context);
        pickerHandle?.destroy();
        pickerHandle = null;
      },
    });
  };

  const saveDraft = (ref: string): void => {
    void postDraft(ref, draftsSignal.value[ref] ?? '');
  };

  const submit = async (): Promise<void> => {
    submittingSignal.value = true;
    try {
      const answers = zonesSignal.value.map((zone) => ({
        ref: zone.ref,
        answer: draftsSignal.value[zone.ref] ?? '',
        verdict: zone.verdict ?? undefined,
      }));
      await postAnswers(answers);
    } finally {
      submittingSignal.value = false;
    }
  };

  return {
    zones: () => zonesSignal.value,
    boxes: () => boxesSignal.value,
    activeRef: () => activeRefSignal.value,
    activePopover: () => activePopoverSignal.value,
    draft: (ref) => draftsSignal.value[ref] ?? '',
    isResolved: (ref) => Boolean(contextsSignal.value[ref]),
    isSubmitting: () => submittingSignal.value,
    setActiveRef: (ref) => {
      activeRefSignal.value = ref;
    },
    setDraft,
    saveDraft,
    submit,
    reanchor,
    hydrate,
    onChange: (listener) => effect(listener),
  };
};
