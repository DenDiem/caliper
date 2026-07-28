interface KeyHint {
  keys: string;
  label: string;
}

// The keyboard contract, shown while armed. It doubles as the legend headless Design Mode agents
// read to know which keys drive the picker.
const HINTS: readonly KeyHint[] = [
  {keys: 'M', label: 'mark'},
  {keys: 'X', label: 'remove'},
  {keys: 'A', label: 'area'},
  {keys: '↑↓', label: 'parent / child'},
  {keys: '←→', label: 'siblings'},
  {keys: 'esc', label: 'exit'},
];

export const Hud = () => (
  <div class="caliper-hud">
    {HINTS.map((hint) => (
      <span class="caliper-hud__item" key={hint.keys}>
        <kbd class="caliper-hud__key">{hint.keys}</kbd>
        <span class="caliper-hud__label">{hint.label}</span>
      </span>
    ))}
  </div>
);
