import {useEffect} from 'preact/hooks';
import type {ReviewClientStore} from './review-controller';

export interface CompletionCardProps {
  store: ReviewClientStore;
}

export const CompletionCard = ({store}: CompletionCardProps) => {
  const card = store.completionCard();

  useEffect(() => {
    if (!card) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') store.dismissCompletionCard();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [card, store]);

  if (!card) return null;

  return (
    <div class="caliper-completion-card" style={{position: 'fixed', pointerEvents: 'auto'}}>
      <button
        type="button"
        class="caliper-completion-card__x"
        onClick={() => store.dismissCompletionCard()}
        aria-label="Close"
      >
        ×
      </button>
      {card.kind === 'page' ? (
        <>
          <p class="caliper-completion-card__text">
            ✓ This page is done — {card.remaining} question{card.remaining === 1 ? '' : 's'} left on {card.route}
          </p>
          <button
            type="button"
            class="caliper-completion-card__action"
            onClick={() => location.assign(card.route)}
          >
            Open →
          </button>
        </>
      ) : (
        <p class="caliper-completion-card__text caliper-completion-card__text--done">
          ✓ All questions answered — send your answers
        </p>
      )}
    </div>
  );
};
