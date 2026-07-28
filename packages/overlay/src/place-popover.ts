import type {Box} from '@caliper/core';

export interface Placement {
  top: number;
  left: number;
  // When the popover can't sit beside the mark, it docks to the far corner and a leader line points
  // back to the mark. null when the popover sits adjacent and needs no leader.
  leader: {x1: number; y1: number; x2: number; y2: number} | null;
}

const INSET = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max));

// Try to seat the popover beside the marked rect without covering it: below → above → right → left,
// each shifted along its free axis to stay on-screen. If none fits, dock to the corner farthest from
// the mark and return a leader from the popover's near corner to the mark's centre.
export const placePopover = (
  mark: Box,
  size: {width: number; height: number},
  viewport: {width: number; height: number},
): Placement => {
  const {width: w, height: h} = size;
  const {width: vw, height: vh} = viewport;

  const alignX = clamp(mark.x, INSET, vw - w - INSET);
  const alignY = clamp(mark.y, INSET, vh - h - INSET);

  const belowTop = mark.y + mark.height + INSET;
  if (belowTop + h <= vh - INSET) return {top: belowTop, left: alignX, leader: null};

  const aboveTop = mark.y - INSET - h;
  if (aboveTop >= INSET) return {top: aboveTop, left: alignX, leader: null};

  const rightLeft = mark.x + mark.width + INSET;
  if (rightLeft + w <= vw - INSET) return {top: alignY, left: rightLeft, leader: null};

  const leftLeft = mark.x - INSET - w;
  if (leftLeft >= INSET) return {top: alignY, left: leftLeft, leader: null};

  const markCx = mark.x + mark.width / 2;
  const markCy = mark.y + mark.height / 2;
  const left = markCx < vw / 2 ? vw - w - INSET : INSET;
  const top = markCy < vh / 2 ? vh - h - INSET : INSET;
  return {
    top,
    left,
    leader: {
      x1: left < markCx ? left + w : left,
      y1: top < markCy ? top + h : top,
      x2: clamp(markCx, mark.x, mark.x + mark.width),
      y2: clamp(markCy, mark.y, mark.y + mark.height),
    },
  };
};
