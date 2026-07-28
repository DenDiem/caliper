import type {Point} from '../schema/annotation.schema';

export type Gesture = 'pick' | 'strike' | 'lasso';

// Below this total path length a drag reads as a plain click → pick the element under it.
const PICK_MAX_LENGTH = 16;
// Net turning (radians) that marks an enclosing loop. A full loop winds ~2π (6.28); a hatch drifts
// only a little. Rule loops out by this first, so reversal count never turns a wobbly lasso red.
const LOOP_WINDING = 4;
// A hatch/scribble reverses direction many times; hand jitter on a loop reverses far fewer.
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

// Net signed turning of the path. A loop accumulates ~±2π; a back-and-forth scribble's turns cancel
// out to ~0. This is what separates "circle an area" from "scribble it out" — reversal count alone
// treats a wobbly hand-drawn loop as a scribble.
const winding = (points: readonly Point[]): number => {
  let total = 0;
  let previousAngle: number | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    if (Math.abs(to.x - from.x) < AXIS_EPSILON && Math.abs(to.y - from.y) < AXIS_EPSILON) continue;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    if (previousAngle !== null) {
      let delta = angle - previousAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      total += delta;
    }
    previousAngle = angle;
  }
  return total;
};

// Classify a freehand pointer path. Pure so it can be re-evaluated live on every pointermove to flip
// the on-screen colour the moment a scribble starts.
export const classifyGesture = (points: readonly Point[]): Gesture => {
  if (points.length < 3 || pathLength(points) < PICK_MAX_LENGTH) return 'pick';

  // A loop winds most of the way around → lasso. Rule it out first so a wobbly loop's reversals
  // never read as a strike.
  if (Math.abs(winding(points)) >= LOOP_WINDING) return 'lasso';

  // Not a loop: many direction reversals = a hatch/scribble = strike, whatever its net drift.
  const reversals = Math.max(axisReversals(points, 'x'), axisReversals(points, 'y'));
  return reversals >= STRIKE_MIN_REVERSALS ? 'strike' : 'lasso';
};
