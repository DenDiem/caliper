import {useEffect, useState} from 'preact/hooks';

interface Shortcut {
  name: string;
  description: string;
  shortcut: string;
}

const toShortcut = (command: chrome.commands.Command): Shortcut => ({
  name: command.name ?? '',
  description: command.description ?? '',
  shortcut: command.shortcut ?? '',
});

const armPicker = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (typeof tab?.id !== 'number') return;
  await chrome.runtime.sendMessage({type: 'caliper/toggle-tab', tabId: tab.id});
};

export const Controls = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  useEffect(() => {
    void chrome.commands
      .getAll()
      .then((commands) => setShortcuts(commands.map(toShortcut).filter((item) => item.description)));
  }, []);

  const unassigned = shortcuts.some((item) => !item.shortcut);

  return (
    <footer class="controls">
      <button class="controls__arm" onClick={() => void armPicker()}>
        <span class="controls__arm-dot" />
        Arm picker
      </button>

      <dl class="keys">
        {shortcuts.map((item) => (
          <div key={item.name} class="keys__row">
            <dt class={`keys__key${item.shortcut ? '' : ' keys__key--missing'}`}>
              {item.shortcut || 'unset'}
            </dt>
            <dd class="keys__label">{item.description}</dd>
          </div>
        ))}
      </dl>

      {unassigned ? (
        <button
          class="controls__link"
          onClick={() => void chrome.tabs.create({url: 'chrome://extensions/shortcuts'})}
        >
          Assign shortcuts →
        </button>
      ) : null}
    </footer>
  );
};
