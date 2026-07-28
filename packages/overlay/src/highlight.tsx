import type {Box} from '@caliper/core';

interface HighlightProps {
  box: Box | null;
  label: string | null;
  variant?: 'default' | 'strike';
}

export const Highlight = ({box, label, variant = 'default'}: HighlightProps) => {
  if (!box) return null;

  return (
    <div
      class={variant === 'strike' ? 'caliper-highlight caliper-highlight--strike' : 'caliper-highlight'}
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
