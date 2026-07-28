import type {CaliperAnnotation} from '@caliper/core';

type Hue = 'blocker' | 'major' | 'minor';

const HUE: Record<string, Hue> = {
  blocker: 'blocker',
  major: 'major',
  minor: 'minor',
  nitpick: 'minor',
};

interface Props {
  annotation: CaliperAnnotation;
  index: number;
  screenshot?: string;
  onRemove: () => void;
}

const token = (annotation: CaliperAnnotation): {text: string; ok: boolean} => {
  const matched = Object.values(annotation.target.styles).find((style) => style.token);
  return matched ? {text: `${matched.token} ✓`, ok: true} : {text: 'no match ⚠', ok: false};
};

const shot = (screenshot?: string) =>
  screenshot ? <img class="card__shot" src={screenshot} alt="" /> : <div class="card__shot" />;

const ordinal = (index: number): string => String(index + 1).padStart(2, '0');

export const DefectCard = ({annotation, index, screenshot, onRemove}: Props) => {
  const hue = HUE[annotation.severity] ?? 'minor';
  const component = annotation.target.componentName ?? annotation.target.tagName;
  const region = annotation.region;

  const topRight = (
    <div class="card__top-right">
      <span class="card__index">{ordinal(index)}</span>
      <button class="card__remove" title="Remove" onClick={onRemove}>
        ×
      </button>
    </div>
  );

  // hue = severity, form = intent: a remove-mark drops severity entirely.
  if (annotation.intent === 'remove') {
    return (
      <li class="card card--remove">
        <div class="card__top">
          <span class="card__tag card__tag--remove">REMOVE</span>
          {topRight}
        </div>
        <p class="card__note card__note--struck">{annotation.comment}</p>
        <div class="card__bottom">
          {shot(screenshot)}
          <div class="card__meta">
            <span class="card__key">SEL</span>
            <span class="card__val">{annotation.target.selector}</span>
            <span class="card__key">CMP</span>
            <span class="card__val">{component}</span>
          </div>
        </div>
      </li>
    );
  }

  if (region) {
    const nodes = region.enclosedSelectors.length;
    const zone = `${Math.round(region.box.width)} × ${Math.round(region.box.height)}${nodes ? ` · ${nodes} node${nodes === 1 ? '' : 's'}` : ''}`;
    return (
      <li class={`card card--${hue}`}>
        <div class="card__top">
          <div class="card__tags">
            <span class="card__pill">{annotation.severity}</span>
            <span class="card__tag card__tag--area">AREA</span>
          </div>
          {topRight}
        </div>
        <p class="card__note">{annotation.comment}</p>
        <div class="card__bottom">
          {shot(screenshot)}
          <div class="card__meta">
            <span class="card__key">ZONE</span>
            <span class="card__val">{zone}</span>
            <span class="card__key">NEAR</span>
            <span class="card__val">{annotation.target.selector}</span>
          </div>
        </div>
      </li>
    );
  }

  const tok = token(annotation);

  if (hue === 'minor') {
    return (
      <li class="card card--compact card--minor">
        <div class="card__compact-body">
          <div class="card__compact-note">{annotation.comment}</div>
          <div class="card__compact-meta">
            {component} · {tok.text}
          </div>
        </div>
        <span class="card__compact-sev">{annotation.severity}</span>
        <button class="card__remove" title="Remove" onClick={onRemove}>
          ×
        </button>
      </li>
    );
  }

  return (
    <li class={`card card--${hue}`}>
      <div class="card__top">
        <div class="card__tags">
          <span class="card__pill">{annotation.severity}</span>
        </div>
        {topRight}
      </div>

      <p class="card__note">{annotation.comment}</p>

      <div class="card__bottom">
        {shot(screenshot)}
        <div class="card__meta">
          <span class="card__key">SEL</span>
          <span class="card__val">{annotation.target.selector}</span>
          <span class="card__key">CMP</span>
          <span class="card__val">{component}</span>
          <span class="card__key">TOK</span>
          <span class={tok.ok ? 'card__val card__val--ok' : 'card__val card__val--warn'}>{tok.text}</span>
        </div>
      </div>
    </li>
  );
};
