import type {Point} from '@caliper/core';

interface LassoPathProps {
  points: readonly Point[];
}

const toPathData = (points: readonly Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');

export const LassoPath = ({points}: LassoPathProps) => {
  if (points.length < 2) return null;

  return (
    <svg class="caliper-lasso" width={window.innerWidth} height={window.innerHeight}>
      <path class="caliper-lasso__path" d={`${toPathData(points)} Z`} />
    </svg>
  );
};
