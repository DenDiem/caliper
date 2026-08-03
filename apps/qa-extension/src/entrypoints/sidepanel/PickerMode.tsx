import {useEffect, useState} from 'preact/hooks';
import {setPickerMode} from './arm';

const MOUNTED_KEY = 'caliper.armed';
const MODE_KEY = 'caliper.pickerArmed';

export const PickerMode = () => {
  const [mounted, setMounted] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const read = () =>
      void chrome.storage.local.get([MOUNTED_KEY, MODE_KEY]).then((store) => {
        setMounted(store[MOUNTED_KEY] === true);
        setArmed(store[MODE_KEY] === true);
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
    <div class="mode">
      <button
        type="button"
        class={armed ? 'mode__btn mode__btn--armed' : 'mode__btn'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void setPickerMode(!armed)}
      >
        <span class="mode__dot" />
        {armed ? 'Arm picker — Alt to use the app' : 'Passive — Alt to mark'}
      </button>
    </div>
  );
};
