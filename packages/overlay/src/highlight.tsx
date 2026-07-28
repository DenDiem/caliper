import type {Box} from '@caliper/core';

interface HighlightProps {
  box: Box | null;
  label: string | null;
  variant?: 'default' | 'strike' | 'area';
}

const frameClass = (variant: 'default' | 'strike' | 'area'): string => {
  if (variant === 'strike') return 'caliper-highlight caliper-highlight--strike';
  if (variant === 'area') return 'caliper-highlight caliper-highlight--area';
  return 'caliper-highlight';
};

const labelClass = (variant: 'default' | 'strike' | 'area'): string =>
  variant === 'strike'
    ? 'caliper-highlight__label caliper-highlight__label--remove'
    : 'caliper-highlight__label';

export const Highlight = ({box, label, variant = 'default'}: HighlightProps) => {
  if (!box) return null;

  return (
    <div
      class={frameClass(variant)}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {label ? <span class={labelClass(variant)}>{label}</span> : null}
    </div>
  );
};
