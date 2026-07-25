import type {Box} from '@caliper/core';

export interface HighlightBoxState {
  readonly ref: string;
  readonly box: Box;
  readonly number: number;
  readonly active: boolean;
  readonly hover: boolean;
  readonly answered: boolean;
}

export interface HighlightLayerProps {
  boxes: HighlightBoxState[];
}

const zoneClassName = ({active, hover, answered}: {active: boolean; hover: boolean; answered: boolean}): string => {
  const classes = ['caliper-zone'];
  if (active) classes.push('caliper-zone--active');
  else if (hover) classes.push('caliper-zone--hover');
  if (answered) classes.push('caliper-zone--answered');
  return classes.join(' ');
};

export const HighlightLayer = ({boxes}: HighlightLayerProps) => (
  <>
    {boxes.map(({ref, box, number, active, hover, answered}) => (
      <div
        key={ref}
        class={zoneClassName({active, hover, answered})}
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
