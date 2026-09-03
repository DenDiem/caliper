import {useState} from 'preact/hooks';
import type {CaliperAnnotation} from '@caliper/core';

type Hue = 'blocker' | 'major' | 'minor';

// A wide element cropped to a fixed square thumbnail shows only its corner (usually blank). Once the
// image loads, elements wider than this ratio render as a full-width strip so the whole thing reads.
const WIDE_RATIO = 2.2;

const HUE: Record<string, Hue> = {
  blocker: 'blocker',
  major: 'major',
  minor: 'minor',
  nitpick: 'minor',
};

interface Props {
  annotation: CaliperAnnotation;
  index: number;
  // Set by the workspace so a card opened from the panel can be scrolled to.
  id?: string;
  screenshot?: string;
  // The card has always lit up on hover, which only ever revealed the remove button. Beside traces
  // that now open, the same hover reads as "click me", so it opens too.
  onOpen?: (id: string) => void;
  onRemove: () => void;
}

const token = (annotation: CaliperAnnotation): {text: string; ok: boolean} => {
  const matched = Object.values(annotation.target.styles).find((style) => style.token);
  return matched ? {text: `${matched.token} ✓`, ok: true} : {text: 'no match ⚠', ok: false};
};

const Shot = ({screenshot}: {screenshot?: string}) => {
  const [wide, setWide] = useState(false);

  if (!screenshot) return <div class="card__shot" />;

  return (
    <img
      class={wide ? 'card__shot card__shot--wide' : 'card__shot'}
      src={screenshot}
      alt=""
      onLoad={(event) => {
        const image = event.currentTarget;
        setWide(image.naturalWidth / image.naturalHeight > WIDE_RATIO);
      }}
    />
  );
};

const ordinal = (index: number): string => String(index + 1).padStart(2, '0');

const INTERACTIVE = 'input, button, video, a, select, textarea';

export const DefectCard = ({annotation, index, id, screenshot, onOpen, onRemove}: Props) => {
  const hue = HUE[annotation.severity] ?? 'minor';
  const component = annotation.target.componentName ?? annotation.target.tagName;
  const region = annotation.region;

  const open = (): void => {
    if (onOpen) return onOpen(annotation.id);
    void chrome.tabs.create({url: chrome.runtime.getURL(`workspace.html#defect/${annotation.id}`)});
  };

  const rootProps = (className: string) => ({
    id,
    class: className,
    onClick: (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE)) return;
      open();
    },
    title: 'Open this defect',
  });

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
      <li {...rootProps('card card--remove')}>
        <div class="card__top">
          <span class="card__tag card__tag--remove">REMOVE</span>
          {topRight}
        </div>
        <p class="card__note card__note--struck">{annotation.comment}</p>
        <div class="card__bottom">
          <Shot screenshot={screenshot} />
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
    const nodes = region.covers.length;
    const zone = `${Math.round(region.box.width)} × ${Math.round(region.box.height)}${nodes ? ` · ${nodes} node${nodes === 1 ? '' : 's'}` : ''}`;
    return (
      <li {...rootProps(`card card--${hue}`)}>
        <div class="card__top">
          <div class="card__tags">
            <span class="card__pill">{annotation.severity}</span>
            <span class="card__tag card__tag--area">AREA</span>
          </div>
          {topRight}
        </div>
        <p class="card__note">{annotation.comment}</p>
        <div class="card__bottom">
          <Shot screenshot={screenshot} />
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
      <li {...rootProps('card card--compact card--minor')}>
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
    <li {...rootProps(`card card--${hue}`)}>
      <div class="card__top">
        <div class="card__tags">
          <span class="card__pill">{annotation.severity}</span>
        </div>
        {topRight}
      </div>

      <p class="card__note">{annotation.comment}</p>

      <div class="card__bottom">
        <Shot screenshot={screenshot} />
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
