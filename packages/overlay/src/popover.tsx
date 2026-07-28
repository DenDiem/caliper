import type {AnnotationIntent, ElementContext, Region, Severity} from '@caliper/core';
import {useState} from 'preact/hooks';

export interface AnnotationDraft {
  context: ElementContext;
  comment: string;
  severity: Severity;
  intent: AnnotationIntent;
  region?: Region;
  figmaUrl?: string;
  screenshot?: string | null;
}

interface PopoverProps {
  context: ElementContext;
  region: Region | null;
  intent: AnnotationIntent;
  screenshot: string | null;
  onSubmit: (draft: AnnotationDraft) => void;
  onCancel: () => void;
}

const SEVERITIES: readonly Severity[] = ['blocker', 'major', 'minor', 'nitpick'];
const INTENTS: readonly {id: AnnotationIntent; label: string}[] = [
  {id: 'change', label: 'Change'},
  {id: 'remove', label: 'Remove'},
];

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 300;
const EDGE_GAP = 8;

export const Popover = ({context, region, intent: initialIntent, screenshot, onSubmit, onCancel}: PopoverProps) => {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity>('minor');
  const [intent, setIntent] = useState<AnnotationIntent>(initialIntent);
  const [figmaUrl, setFigmaUrl] = useState('');

  const box = region?.box ?? context.box;

  const submit = () => {
    const trimmed = comment.trim();
    if (intent === 'change' && !trimmed) return;
    onSubmit({
      context,
      comment: trimmed || 'Remove this element',
      severity,
      intent,
      region: region ?? undefined,
      figmaUrl: figmaUrl.trim() || undefined,
    });
  };

  const below = box.y + box.height + EDGE_GAP;
  const fitsBelow = below + POPOVER_HEIGHT < window.innerHeight;
  const top = fitsBelow ? below : Math.max(EDGE_GAP, box.y - POPOVER_HEIGHT - EDGE_GAP);
  const left = Math.max(EDGE_GAP, Math.min(box.x, window.innerWidth - POPOVER_WIDTH - EDGE_GAP));

  const heading = region ? `Area · ${context.componentName ?? context.tagName}` : context.componentName ?? context.selector;

  return (
    <div class="caliper-popover" style={{top: `${top}px`, left: `${left}px`}}>
      <div class="caliper-popover__component">{heading}</div>

      {screenshot ? <img class="caliper-popover__shot" src={screenshot} alt="" /> : null}

      <div class="caliper-popover__intent" role="group">
        {INTENTS.map((item) => (
          <button
            key={item.id}
            type="button"
            class={
              item.id === intent
                ? `caliper-popover__intent-option caliper-popover__intent-option--active caliper-popover__intent-option--${item.id}`
                : 'caliper-popover__intent-option'
            }
            onClick={() => setIntent(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        class="caliper-popover__field"
        rows={3}
        placeholder={intent === 'remove' ? 'Why remove it? (optional)' : 'What is wrong?'}
        value={comment}
        onInput={(event) => setComment(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
        }}
        autofocus
      />

      <input
        class="caliper-popover__field"
        type="url"
        placeholder="Figma URL (optional)"
        value={figmaUrl}
        onInput={(event) => setFigmaUrl(event.currentTarget.value)}
      />

      <select
        class="caliper-popover__field"
        value={severity}
        onChange={(event) =>
          setSeverity(SEVERITIES.find((item) => item === event.currentTarget.value) ?? 'minor')
        }
      >
        {SEVERITIES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>

      <div class="caliper-popover__actions">
        <button class="caliper-popover__button caliper-popover__button--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button class="caliper-popover__button" onClick={submit}>
          {intent === 'remove' ? 'Mark removal' : 'Save'}
        </button>
      </div>
    </div>
  );
};
