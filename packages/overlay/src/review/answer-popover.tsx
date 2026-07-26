import {useEffect, useState} from 'preact/hooks';
import type {Box} from '@caliper/core';
import type * as preact from 'preact';

export interface AnswerPopoverProps {
  zoneRef: string;
  question: string;
  box: Box;
  answer: string;
  animateQuestion: boolean;
  isLast: boolean;
  onInput: (value: string) => void;
  onClose: () => void;
  onDone: () => void;
}

const TYPEWRITER_INTERVAL_MS = 20;

export const AnswerPopover = ({
  question,
  box,
  answer,
  animateQuestion,
  isLast,
  onInput,
  onClose,
  onDone,
}: AnswerPopoverProps) => {
  const [revealedLength, setRevealedLength] = useState(animateQuestion ? 0 : question.length);

  useEffect(() => {
    if (!animateQuestion) {
      setRevealedLength(question.length);
      return;
    }

    setRevealedLength(0);
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed += 1;
      setRevealedLength(revealed);
      if (revealed >= question.length) window.clearInterval(timer);
    }, TYPEWRITER_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [question, animateQuestion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const skipTypewriter = (): void => setRevealedLength(question.length);
  const typing = animateQuestion && revealedLength < question.length;

  return (
    <div
      class="caliper-answer-popover"
      style={{position: 'fixed', left: `${box.x}px`, top: `${box.y + box.height}px`, pointerEvents: 'auto'}}
    >
      <button type="button" class="caliper-answer-popover__x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <p class="caliper-answer-popover__q" onClick={skipTypewriter}>
        {question.slice(0, revealedLength)}
        {typing ? <span class="caliper-answer-popover__cursor" /> : null}
      </p>
      <textarea
        class="caliper-answer-popover__input"
        value={answer}
        onInput={(event: preact.JSX.TargetedEvent<HTMLTextAreaElement>) => onInput(event.currentTarget.value)}
        placeholder="Answer…"
      />
      <button type="button" class="caliper-answer-popover__action" onClick={onDone}>
        {isLast ? 'Done' : 'Next →'}
      </button>
    </div>
  );
};
