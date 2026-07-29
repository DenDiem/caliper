import type {ComponentChildren} from 'preact';

interface Props {
  connected: boolean;
  onArm: () => void;
  onConnect: () => void;
}

const STEPS: readonly {n: string; text: ComponentChildren}[] = [
  {n: '01', text: <>Press <span class="kbd">⌥⇧C</span> to arm the picker.</>},
  {n: '02', text: <>Click any element you want to flag.</>},
  {n: '03', text: <>Type what is wrong and save the defect.</>},
];

export const EmptyState = ({connected, onArm, onConnect}: Props) => (
  <div class="empty">
    <div class="empty__body">
      <div>
        <p class="empty__title">Nothing measured yet</p>
        <p class="empty__lead">
          Arm the picker, then click any element on the page to record what is wrong with it — Caliper
          captures its selector, owning component and design token for you.
        </p>
      </div>

      <div class="empty__steps">
        {STEPS.map((step) => (
          <div key={step.n} class="empty__step">
            <span class="empty__step-n">{step.n}</span>
            <span class="empty__step-t">{step.text}</span>
          </div>
        ))}
      </div>

      <div class="empty__jira">
        <div>{connected ? 'Jira connected' : 'Jira not connected'}</div>
        <div>optional · export still works</div>
        {connected ? null : (
          <button class="empty__jira-link" onClick={onConnect}>
            connect →
          </button>
        )}
      </div>
    </div>

    <div class="empty__foot">
      <button class="empty__arm" onClick={onArm}>
        <span class="empty__arm-dot" />
        ARM PICKER
      </button>
      <p class="empty__hint">⌥⇧C arm · ⌥⇧P panel</p>
    </div>
  </div>
);
