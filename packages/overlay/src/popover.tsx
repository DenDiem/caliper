import type {ElementContext, Severity} from '@caliper/core';
import {useState} from 'preact/hooks';

export interface AnnotationDraft {
  context: ElementContext;
  comment: string;
  severity: Severity;
  figmaUrl?: string;
  screenshot?: string | null;
}

interface PopoverProps {
  context: ElementContext;
  screenshot: string | null;
  onSubmit: (draft: AnnotationDraft) => void;
  onCancel: () => void;
}

const SEVERITIES: readonly Severity[] = ['blocker', 'major', 'minor', 'nitpick'];

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 260;
const EDGE_GAP = 8;

export const Popover = ({context, screenshot, onSubmit, onCancel}: PopoverProps) => {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity>('minor');
  const [figmaUrl, setFigmaUrl] = useState('');

  const submit = () => {
    if (!comment.trim()) return;
    onSubmit({
      context,
      comment: comment.trim(),
      severity,
      figmaUrl: figmaUrl.trim() || undefined,
    });
  };

  const below = context.box.y + context.box.height + EDGE_GAP;
  const fitsBelow = below + POPOVER_HEIGHT < window.innerHeight;
  const top = fitsBelow
    ? below
    : Math.max(EDGE_GAP, context.box.y - POPOVER_HEIGHT - EDGE_GAP);
  const left = Math.max(
    EDGE_GAP,
    Math.min(context.box.x, window.innerWidth - POPOVER_WIDTH - EDGE_GAP),
  );

  return (
    <div class="caliper-popover" style={{top: `${top}px`, left: `${left}px`}}>
      <div class="caliper-popover__component">{context.componentName ?? context.selector}</div>

      {screenshot ? <img class="caliper-popover__shot" src={screenshot} alt="" /> : null}

      <textarea
        class="caliper-popover__field"
        rows={3}
        placeholder="What is wrong?"
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
          Save
        </button>
      </div>
    </div>
  );
};
