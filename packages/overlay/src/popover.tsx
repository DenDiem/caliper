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
  top: number;
  left: number;
  onSubmit: (draft: AnnotationDraft) => void;
  onCancel: () => void;
}

const SEVERITIES: readonly Severity[] = ['blocker', 'major', 'minor'];

const token = (context: ElementContext): {text: string; ok: boolean} => {
  const matched = Object.values(context.styles).find((style) => style.token);
  return matched ? {text: `${matched.token} ✓`, ok: true} : {text: 'no match ⚠', ok: false};
};

export const Popover = ({context, region, intent: initialIntent, top, left, onSubmit, onCancel}: PopoverProps) => {
  const [comment, setComment] = useState('');
  const [severity, setSeverity] = useState<Severity>('major');
  const [intent, setIntent] = useState<AnnotationIntent>(initialIntent);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaOpen, setFigmaOpen] = useState(false);

  const tok = token(context);
  const component = context.componentName ?? context.tagName;

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

  return (
    <div class="caliper-pop" style={{top: `${top}px`, left: `${left}px`}}>
      <div class="caliper-pop__head">
        <div class="caliper-pop__meta">
          <span class="caliper-pop__key">SEL</span>
          <span class="caliper-pop__val">{context.selector}</span>
          <span class="caliper-pop__key">TOK</span>
          <span class={tok.ok ? 'caliper-pop__val caliper-pop__val--ok' : 'caliper-pop__val caliper-pop__val--warn'}>
            {tok.text}
          </span>
        </div>
        <span class="caliper-pop__pill">{region ? 'area' : component}</span>
      </div>

      <textarea
        class="caliper-pop__text"
        placeholder={intent === 'remove' ? 'Why remove it? (optional)' : 'What is wrong?'}
        value={comment}
        onInput={(event) => setComment(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
        }}
        autofocus
      />

      <div class="caliper-pop__sev" role="group">
        {SEVERITIES.map((item) => (
          <button
            key={item}
            type="button"
            class={
              item === severity
                ? `caliper-pop__sev-opt caliper-pop__sev-opt--active caliper-pop__sev-opt--${item}`
                : 'caliper-pop__sev-opt'
            }
            onClick={() => setSeverity(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div class="caliper-pop__secondary">
        <div class="caliper-pop__intent" role="group">
          <button
            type="button"
            class={intent === 'change' ? 'caliper-pop__intent-opt caliper-pop__intent-opt--active' : 'caliper-pop__intent-opt'}
            onClick={() => setIntent('change')}
          >
            Change
          </button>
          <button
            type="button"
            class={
              intent === 'remove'
                ? 'caliper-pop__intent-opt caliper-pop__intent-opt--active caliper-pop__intent-opt--remove'
                : 'caliper-pop__intent-opt'
            }
            onClick={() => setIntent('remove')}
          >
            Remove
          </button>
        </div>
        <button type="button" class="caliper-pop__figma-toggle" onClick={() => setFigmaOpen((value) => !value)}>
          {figmaOpen ? '− Figma' : '＋ Figma'}
        </button>
      </div>

      {figmaOpen ? (
        <input
          class="caliper-pop__figma"
          type="url"
          placeholder="Figma URL"
          value={figmaUrl}
          onInput={(event) => setFigmaUrl(event.currentTarget.value)}
        />
      ) : null}

      <div class="caliper-pop__foot">
        <span class="caliper-pop__hint">⌘⏎ save · esc dismiss</span>
        <div class="caliper-pop__actions">
          <button class="caliper-pop__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button class="caliper-pop__save" onClick={submit}>
            {intent === 'remove' ? 'Mark removal' : 'Save defect'}
          </button>
        </div>
      </div>
    </div>
  );
};
