import type {Box} from '@caliper/core';

export interface HighlightBoxState {
  readonly ref: string;
  readonly box: Box;
  readonly number: number;
  readonly active: boolean;
  readonly hover: boolean;
}

export interface HighlightLayerProps {
  boxes: HighlightBoxState[];
}

const zoneClassName = ({active, hover}: {active: boolean; hover: boolean}): string => {
  if (active) return 'caliper-zone caliper-zone--active';
  if (hover) return 'caliper-zone caliper-zone--hover';
  return 'caliper-zone';
};

export const HighlightLayer = ({boxes}: HighlightLayerProps) => (
  <>
    {boxes.map(({ref, box, number, active, hover}) => (
      <div
        key={ref}
        class={zoneClassName({active, hover})}
        style={{
          position: 'fixed',
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          pointerEvents: 'none',
        }}
      >
        <span class="caliper-zone__badge">{number}</span>
      </div>
    ))}
  </>
);
