import type {ComponentChildren} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {setPickerMode} from './arm';

const MODE_KEY = 'caliper.pickerArmed';

interface Props {
  connected: boolean;
  onConnect: () => void;
}

const STEPS: readonly {n: string; text: ComponentChildren}[] = [
  {n: '01', text: <>Press <span class="kbd">⌥⇧C</span> to turn the picker on.</>},
  {n: '02', text: <>Click any element you want to flag (hold <span class="kbd">Alt</span> to use the app).</>},
  {n: '03', text: <>Type what is wrong and save the defect.</>},
];

export const EmptyState = ({connected, onConnect}: Props) => {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const read = () => void chrome.storage.local.get(MODE_KEY).then((store) => setArmed(store[MODE_KEY] === true));
    read();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (MODE_KEY in changes) read();
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  return (
    <div class="empty">
    <div class="empty__body">
      <div>
        <p class="empty__title">Nothing measured yet</p>
        <p class="empty__lead">
          Turn the picker on, then click any element on the page to record what is wrong with it —
          Caliper captures its selector, owning component and design token for you.
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
      <button
        class={armed ? 'empty__arm empty__arm--on' : 'empty__arm'}
        onClick={() => void setPickerMode(!armed)}
      >
        <span class="empty__arm-dot" />
        {armed ? 'PICKER ON' : 'TURN ON PICKER'}
      </button>
      <p class="empty__hint">⌥⇧C picker · ⌥⇧P panel</p>
    </div>
  </div>
  );
};
