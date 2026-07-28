import type {Box, Point} from '../schema/annotation.schema';

export const pathBounds = (points: readonly Point[]): Box => {
  const first = points[0];
  if (!first) return {x: 0, y: 0, width: 0, height: 0};

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const {x, y} of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
};
