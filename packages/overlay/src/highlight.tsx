import type {Box} from '@caliper/core';

interface HighlightProps {
  box: Box | null;
  label: string | null;
}

export const Highlight = ({box, label}: HighlightProps) => {
  if (!box) return null;

  return (
    <div
      class="caliper-highlight"
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {label ? <span class="caliper-highlight__label">{label}</span> : null}
    </div>
  );
};
