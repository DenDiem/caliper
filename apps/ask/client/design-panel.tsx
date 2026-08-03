import type {CaliperAnnotation} from '@caliper/core';

export interface DesignPanelProps {
  marks: readonly CaliperAnnotation[];
  sent: boolean;
  armed: boolean;
  warning: string | null;
  onArm: () => void;
  onSubmit: () => void;
}

type Hue = 'blocker' | 'major' | 'minor';

const HUE: Record<string, Hue> = {
  blocker: 'blocker',
  major: 'major',
  minor: 'minor',
  nitpick: 'minor',
};

interface Badge {
  label: string;
  kind: 'area' | 'remove' | 'add';
}

// The mark's kind, drawn from markType (a lassoed area) then intent (delete / insert). A plain
// element change carries no badge — just its severity.
const badgeOf = (annotation: CaliperAnnotation): Badge | null => {
  if (annotation.intent === 'remove') return {label: 'REMOVE', kind: 'remove'};
  if (annotation.markType === 'area') return {label: 'AREA', kind: 'area'};
  if (annotation.intent === 'add') return {label: 'ADD', kind: 'add'};
  return null;
};

const ordinal = (index: number): string => String(index + 1).padStart(2, '0');

const shot = (screenshot?: string) =>
  screenshot ? (
    <img class="card__shot" src={screenshot} alt="" />
  ) : (
    <div class="card__shot" />
  );

interface MarkCardProps {
  annotation: CaliperAnnotation;
  index: number;
}

const MarkCard = ({annotation, index}: MarkCardProps) => {
  const hue = HUE[annotation.severity] ?? 'minor';
  const component = annotation.target.componentName ?? annotation.target.tagName;
  const badge = badgeOf(annotation);
  const isRemove = annotation.intent === 'remove';

  return (
    <li class={`card card--${hue}${isRemove ? ' card--remove' : ''}`}>
      <div class="card__top">
        <div class="card__tags">
          {isRemove ? (
            <span class="card__tag card__tag--remove">REMOVE</span>
          ) : (
            <span class="card__pill">{annotation.severity}</span>
          )}
          {badge && badge.kind !== 'remove' ? (
            <span class={`card__tag card__tag--${badge.kind}`}>{badge.label}</span>
          ) : null}
        </div>
        <span class="card__index">{ordinal(index)}</span>
      </div>

      <p class={isRemove ? 'card__note card__note--struck' : 'card__note'}>{annotation.comment}</p>

      <div class="card__bottom">
        {shot(annotation.screenshot)}
        <div class="card__meta">
          <span class="card__key">CMP</span>
          <span class="card__val">{component}</span>
          <span class="card__key">SEL</span>
          <span class="card__val">{annotation.target.selector}</span>
        </div>
      </div>
    </li>
  );
};

export const DesignPanel = ({marks, sent, armed, warning, onArm, onSubmit}: DesignPanelProps) => (
  <aside class="caliper-design-panel">
    <header class="caliper-design-panel__head">
      <div class="caliper-design-panel__brand">
        <span class="caliper-design-panel__mark" aria-hidden="true" />
        <span class="caliper-design-panel__title">Caliper design</span>
      </div>
      <span class="caliper-design-panel__count">
        {marks.length} mark{marks.length === 1 ? '' : 's'}
      </span>
    </header>

    {sent ? null : (
      <div class="caliper-design-panel__tools">
        <button
          type="button"
          class={armed ? 'caliper-design-panel__arm caliper-design-panel__arm--on' : 'caliper-design-panel__arm'}
          onClick={onArm}
        >
          <span class="caliper-design-panel__arm-dot" aria-hidden="true" />
          {armed ? 'PICKER ON' : 'PICKER OFF'}
        </button>
        <span class="caliper-design-panel__arm-hint">
          {armed ? 'Hold Alt to use the app' : 'Hold Alt to mark'}
        </span>
      </div>
    )}

    {marks.length === 0 ? (
      <div class="caliper-design-panel__empty">
        <p class="caliper-design-panel__empty-text">Mark elements on the page; they&apos;ll list here.</p>
      </div>
    ) : (
      <ul class="caliper-design-panel__list">
        {marks.map((annotation, index) => (
          <MarkCard key={annotation.id} annotation={annotation} index={index} />
        ))}
      </ul>
    )}

    <footer class="caliper-design-panel__foot">
      {sent ? (
        <span class="caliper-design-panel__done">✓ Sent to the agent — you can close this window</span>
      ) : (
        <>
          {warning ? <p class="caliper-design-panel__warning">{warning}</p> : null}
          <button
            type="button"
            class="caliper-design-panel__submit"
            disabled={marks.length === 0}
            onClick={onSubmit}
          >
            Submit {marks.length} mark{marks.length === 1 ? '' : 's'} to the agent
          </button>
        </>
      )}
    </footer>
  </aside>
);
