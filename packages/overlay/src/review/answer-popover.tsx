import type {Box} from '@caliper/core';
import type * as preact from 'preact';

export interface AnswerPopoverProps {
  ref: string;
  question: string;
  box: Box;
  answer: string;
  onInput: (value: string) => void;
  onClose: () => void;
}

export const AnswerPopover = ({question, box, answer, onInput, onClose}: AnswerPopoverProps) => (
  <div
    class="caliper-answer-popover"
    style={{position: 'fixed', left: `${box.x}px`, top: `${box.y + box.height}px`, pointerEvents: 'auto'}}
  >
    <p class="caliper-answer-popover__q">{question}</p>
    <textarea
      class="caliper-answer-popover__input"
      value={answer}
      onInput={(event: preact.JSX.TargetedEvent<HTMLTextAreaElement>) => onInput(event.currentTarget.value)}
      placeholder="Answer…"
    />
    <button type="button" class="caliper-answer-popover__close" onClick={onClose}>
      Done
    </button>
  </div>
);
