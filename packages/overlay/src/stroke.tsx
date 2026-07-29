import type {Point} from '@caliper/core';

interface Props {
  points: readonly Point[];
  strike: boolean;
}

const toPathData = (points: readonly Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');

// The live ink trail the developer draws — teal while it reads as a click/lasso, red the moment the
// path looks like a scribble (strike / remove).
export const GestureStroke = ({points, strike}: Props) => {
  if (points.length < 2) return null;

  return (
    <svg class="caliper-stroke" width={window.innerWidth} height={window.innerHeight}>
      <path
        class={strike ? 'caliper-stroke__path caliper-stroke__path--strike' : 'caliper-stroke__path'}
        d={toPathData(points)}
      />
    </svg>
  );
};
