import type {ElementContext, Severity, Verdict} from '../schema/annotation.schema';
import type {ReviewZone} from '../schema/review.schema';

export interface ReviewZoneState {
  ref: string;
  selector: string | null;
  route: string | null;
  question: string;
  severity: Severity | null;
  resolvedTarget: ElementContext | null;
  // The route (location.pathname) the developer was actually on when this zone resolved on screen.
  // Null until resolved; compared against the expected `route` to detect a guard redirect.
  resolvedRoute: string | null;
  answer: string | null;
  verdict: Verdict | null;
  answered: boolean;
}

export interface ReviewSessionState {
  id: string;
  token: string;
  target: string;
  createdAt: string;
  zones: ReviewZoneState[];
  // Set when the developer sends via "Send & finish": unanswered zones become `skipped` rather than
  // staying pending, and the session counts as complete even though not every zone was answered.
  finalized: boolean;
}

const toZoneState = (zone: ReviewZone): ReviewZoneState => ({
  ref: zone.ref,
  selector: zone.selector ?? null,
  route: zone.route ?? null,
  question: zone.question,
  severity: zone.severity ?? null,
  resolvedTarget: null,
  resolvedRoute: null,
  answer: null,
  verdict: null,
  answered: false,
});

const mapZone = (
  state: ReviewSessionState,
  ref: string,
  update: (zone: ReviewZoneState) => ReviewZoneState,
): ReviewSessionState => ({
  ...state,
  zones: state.zones.map((zone) => (zone.ref === ref ? update(zone) : zone)),
});

export const createSession = (init: {
  id: string;
  token: string;
  target: string;
  createdAt: string;
}): ReviewSessionState => ({...init, zones: [], finalized: false});

export const addZones = (state: ReviewSessionState, zones: readonly ReviewZone[]): ReviewSessionState => {
  let next = state.zones;
  for (const zone of zones) {
    const incoming = toZoneState(zone);
    const index = next.findIndex((existing) => existing.ref === zone.ref);
    next =
      index === -1
        ? [...next, incoming]
        : next.map((existing, position) =>
            position === index
              ? {
                  ...incoming,
                  resolvedTarget: existing.resolvedTarget,
                  resolvedRoute: existing.resolvedRoute,
                  answer: existing.answer,
                  verdict: existing.verdict,
                  answered: existing.answered,
                }
              : existing,
          );
  }
  return {...state, zones: next};
};

export const setDraft = (
  state: ReviewSessionState,
  ref: string,
  patch: {answer?: string | null; verdict?: Verdict | null},
): ReviewSessionState =>
  mapZone(state, ref, (zone) => ({
    ...zone,
    answer: patch.answer === undefined ? zone.answer : patch.answer,
    verdict: patch.verdict === undefined ? zone.verdict : patch.verdict,
  }));

export const resolveZone = (
  state: ReviewSessionState,
  ref: string,
  target: ElementContext,
  route: string | null,
): ReviewSessionState => mapZone(state, ref, (zone) => ({...zone, resolvedTarget: target, resolvedRoute: route}));

export const submitAnswers = (
  state: ReviewSessionState,
  answers: readonly {ref: string; answer: string; verdict?: Verdict | null}[],
): ReviewSessionState => {
  let next = state;
  for (const entry of answers) {
    next = mapZone(next, entry.ref, (zone) => ({
      ...zone,
      answer: entry.answer,
      verdict: entry.verdict === undefined ? zone.verdict : entry.verdict,
      answered: true,
    }));
  }
  return next;
};

export const pendingRefs = (state: ReviewSessionState): string[] =>
  state.zones.filter((zone) => !zone.answered).map((zone) => zone.ref);

// Zones whose selector matched nothing on the page yet (no context resolved). Distinct from "pending":
// a resolved-but-unanswered zone is on screen waiting for the developer, an unresolved one never
// appeared. Surfacing it separates "selector missed" from "not answered" in the PENDING response.
export const unresolvedRefs = (state: ReviewSessionState): string[] =>
  state.zones.filter((zone) => zone.resolvedTarget === null).map((zone) => zone.ref);

export const allAnswered = (state: ReviewSessionState): boolean =>
  state.zones.length > 0 && state.zones.every((zone) => zone.answered);

export const finalizeSession = (state: ReviewSessionState): ReviewSessionState => ({...state, finalized: true});

// A review is complete once every zone is answered OR the developer explicitly finished it — the
// latter leaves unanswered zones as `skipped` instead of blocking the agent forever.
export const isComplete = (state: ReviewSessionState): boolean => allAnswered(state) || state.finalized;
