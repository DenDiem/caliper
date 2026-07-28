import type {OverlayMode} from './mode';

interface ToolbarProps {
  mode: OverlayMode;
  onMode: (mode: OverlayMode) => void;
}

const MODES: readonly {id: OverlayMode; label: string; title: string}[] = [
  {id: 'pick', label: 'Pick', title: 'Click an element to annotate it'},
  {id: 'strike', label: 'Strike', title: 'Click an element to mark it for removal'},
  {id: 'lasso', label: 'Lasso', title: 'Drag to circle an area when no single element fits'},
];

export const Toolbar = ({mode, onMode}: ToolbarProps) => (
  <div class="caliper-toolbar">
    <span class="caliper-toolbar__dot" />
    <div class="caliper-toolbar__modes">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          class={
            item.id === mode
              ? 'caliper-toolbar__mode caliper-toolbar__mode--active'
              : 'caliper-toolbar__mode'
          }
          onClick={() => onMode(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
    <span class="caliper-toolbar__hint">Esc to exit</span>
  </div>
);
