import type {ElementContext, Severity} from '@caliper/core';
import {useState} from 'preact/hooks';

export interface AnnotationDraft {
  context: ElementContext;
  comment: string;
  severity: Severity;
  figmaUrl?: string;
}

interface PopoverProps {
  context: ElementContext;
  onSubmit: (draft: AnnotationDraft) => void;
  onCancel: () => void;
}

const SEVERITIES: readonly Severity[] = ['blocker', 'major', 'minor', 'nitpick'];

export const Popover = ({context, onSubmit, onCancel}: PopoverProps) => {
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

  const top = Math.min(context.box.y + context.box.height + 8, window.innerHeight - 220);
  const left = Math.min(context.box.x, window.innerWidth - 300);

  return (
    <div class="caliper-popover" style={{top: `${top}px`, left: `${left}px`}}>
      <div class="caliper-popover__component">{context.componentName ?? context.selector}</div>

      <textarea
        class="caliper-popover__field"
        rows={3}
        placeholder="What is wrong?"
        value={comment}
        onInput={(event) => setComment(event.currentTarget.value)}
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
