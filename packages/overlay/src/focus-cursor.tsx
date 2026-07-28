import type {Box} from '@caliper/core';

interface Props {
  box: Box;
  tag: string;
  selector: string;
  position: {index: number; total: number} | null;
}

// The keyboard focus ring — a solid teal outline + halo, distinct from the dashed hover/mark frame,
// with a floating label carrying the tag, selector, and position among its siblings.
export const FocusCursor = ({box, tag, selector, position}: Props) => (
  <div
    class="caliper-focus"
    style={{
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }}
  >
    <span class="caliper-focus__label">
      <span class="caliper-focus__tag">{tag}</span>
      <span class="caliper-focus__sel">{selector}</span>
      {position ? (
        <span class="caliper-focus__pos">
          {position.index} / {position.total}
        </span>
      ) : null}
    </span>
  </div>
);
