import type {ElementContext, Severity, Verdict} from '../schema/annotation.schema';
import type {ReviewZone} from '../schema/review.schema';

export interface ReviewZoneState {
  ref: string;
  selector: string | null;
  route: string | null;
  question: string;
  severity: Severity | null;
  resolvedTarget: ElementContext | null;
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
}

const toZoneState = (zone: ReviewZone): ReviewZoneState => ({
  ref: zone.ref,
  selector: zone.selector ?? null,
  route: zone.route ?? null,
  question: zone.question,
  severity: zone.severity ?? null,
  resolvedTarget: null,
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
}): ReviewSessionState => ({...init, zones: []});

export const addZones = (state: ReviewSessionState, zones: readonly ReviewZone[]): ReviewSessionState => {
  let next = state.zones;
  for (const zone of zones) {
    const incoming = toZoneState(zone);
    const index = next.findIndex((existing) => existing.ref === zone.ref);
    next =
      index === -1
        ? [...next, incoming]
        : next.map((existing, position) =>
            position === index ? {...incoming, resolvedTarget: existing.resolvedTarget, answer: existing.answer, verdict: existing.verdict, answered: existing.answered} : existing,
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

export const resolveZone = (state: ReviewSessionState, ref: string, target: ElementContext): ReviewSessionState =>
  mapZone(state, ref, (zone) => ({...zone, resolvedTarget: target}));

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

export const allAnswered = (state: ReviewSessionState): boolean =>
  state.zones.length > 0 && state.zones.every((zone) => zone.answered);
