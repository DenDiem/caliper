import {useEffect, useState} from 'preact/hooks';
import {setPickerMode} from './arm';

const MOUNTED_KEY = 'caliper.armed';
const MODE_KEY = 'caliper.pickerArmed';

export const PickerMode = () => {
  const [mounted, setMounted] = useState(false);
  const [armed, setArmed] = useState(true);

  useEffect(() => {
    const read = () =>
      void chrome.storage.local.get([MOUNTED_KEY, MODE_KEY]).then((store) => {
        setMounted(store[MOUNTED_KEY] === true);
        setArmed(store[MODE_KEY] !== false);
      });
    read();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (MOUNTED_KEY in changes || MODE_KEY in changes) read();
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  if (!mounted) return null;

  return (
    <div class="mode" onPointerDown={(event) => event.stopPropagation()}>
      <div class="mode__seg">
        <button
          type="button"
          class={armed ? 'mode__opt mode__opt--active' : 'mode__opt'}
          onClick={() => void setPickerMode(true)}
        >
          Mark
        </button>
        <button
          type="button"
          class={armed ? 'mode__opt' : 'mode__opt mode__opt--active'}
          onClick={() => void setPickerMode(false)}
        >
          Use app
        </button>
      </div>
      <span class="mode__hint">{armed ? 'Hold Alt to use the app' : 'Hold Alt to mark'}</span>
    </div>
  );
};
