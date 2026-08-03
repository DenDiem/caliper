import {useEffect, useState} from 'preact/hooks';
import {setPickerMode} from './arm';

const MODE_KEY = 'caliper.pickerArmed';

interface Props {
  copied: string | null;
  jiraLabel: string;
  onCopyToon: () => void;
  onJira: () => void;
  onJson: () => void;
  onZip: () => void;
  onClear: () => void;
}

export const PanelFooter = ({copied, jiraLabel, onCopyToon, onJira, onJson, onZip, onClear}: Props) => {
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
    <footer class="foot">
      <div class="foot__exports">
        <button class="export export--primary" onClick={onCopyToon}>
          {copied === 'toon' ? 'COPIED ✓' : 'COPY TOON'}
        </button>
        <button class="export export--secondary" onClick={onJira}>
          {jiraLabel}
        </button>
      </div>

      <div class="foot__row">
        <div class="foot__links">
          <button class="link" onClick={onJson}>
            {copied === 'json' ? 'copied' : 'JSON'}
          </button>
          <button class="link" onClick={onZip}>
            zip
          </button>
          <button class="link" onClick={onClear}>
            clear
          </button>
        </div>

        <button
          class={armed ? 'arm arm--on' : 'arm'}
          title="Mark ⇄ Browse (⌥⇧C) · hold Alt to invert"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void setPickerMode(!armed)}
        >
          <span class="arm__dot" />
          {armed ? 'PICKER ON' : 'PICKER OFF'}
        </button>
      </div>
    </footer>
  );
};
