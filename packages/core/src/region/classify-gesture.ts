import type {Point} from '../schema/annotation.schema';

export type Gesture = 'pick' | 'strike' | 'lasso';

// Below this total path length a drag reads as a plain click → pick the element under it.
const PICK_MAX_LENGTH = 16;
// A hatch/scribble reverses direction many times; a loop reverses ~twice per axis.
const STRIKE_MIN_REVERSALS = 4;
// Jitter smaller than this doesn't count as a direction change.
const AXIS_EPSILON = 2;

const pathLength = (points: readonly Point[]): number => {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
};

const axisReversals = (points: readonly Point[], axis: 'x' | 'y'): number => {
  let reversals = 0;
  let previousSign = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const delta = to[axis] - from[axis];
    if (Math.abs(delta) < AXIS_EPSILON) continue;
    const sign = delta > 0 ? 1 : -1;
    if (previousSign !== 0 && sign !== previousSign) reversals += 1;
    previousSign = sign;
  }
  return reversals;
};

// Classify a freehand pointer path: a short one is a click (pick), a zigzag/hatch is a strike
// (remove), anything else that travelled far enough is a lasso (region). Pure so it can be
// re-evaluated live on every pointermove to flip the on-screen colour the moment a scribble starts.
export const classifyGesture = (points: readonly Point[]): Gesture => {
  if (points.length < 3 || pathLength(points) < PICK_MAX_LENGTH) return 'pick';
  const reversals = Math.max(axisReversals(points, 'x'), axisReversals(points, 'y'));
  return reversals >= STRIKE_MIN_REVERSALS ? 'strike' : 'lasso';
};
