import {useState} from 'preact/hooks';
import {armPicker} from './arm';

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

  const arm = () => {
    setArmed((value) => !value);
    void armPicker();
  };

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

        <button class={armed ? 'arm arm--on' : 'arm'} onClick={arm}>
          <span class="arm__dot" />
          {armed ? 'ARMED ⌥⇧C' : 'ARM PICKER'}
        </button>
      </div>
    </footer>
  );
};
