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

export const Shortcuts = () => {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  useEffect(() => {
    void chrome.commands.getAll().then((commands) => setShortcuts(commands.map(toShortcut)));
  }, []);

  if (shortcuts.length === 0) return null;

  const unassigned = shortcuts.some((item) => !item.shortcut);

  return (
    <footer class="shortcuts">
      {shortcuts.map((item) => (
        <div key={item.name} class="shortcuts__row">
          <code class={`shortcuts__key${item.shortcut ? '' : ' shortcuts__key--missing'}`}>
            {item.shortcut || 'not assigned'}
          </code>
          <span class="shortcuts__label">{item.description}</span>
        </div>
      ))}

      {unassigned ? (
        <button
          class="shortcuts__fix"
          onClick={() => void chrome.tabs.create({url: 'chrome://extensions/shortcuts'})}
        >
          Assign shortcuts
        </button>
      ) : null}
    </footer>
  );
};
