import type {Box} from '@caliper/core';

export interface HighlightLayerProps {
  boxes: {ref: string; box: Box; active: boolean}[];
}

export const HighlightLayer = ({boxes}: HighlightLayerProps) => (
  <>
    {boxes.map(({ref, box, active}) => (
      <div
        key={ref}
        class={active ? 'caliper-zone caliper-zone--active' : 'caliper-zone'}
        style={{
          position: 'fixed',
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          pointerEvents: 'none',
        }}
      />
    ))}
  </>
);
