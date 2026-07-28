import {useState} from 'preact/hooks';
import {chromeStorageSink, type CaliperStore} from '../../sinks/chrome-storage.sink';

interface Props {
  store: CaliperStore;
  onChange: () => void;
  onClose: () => void;
}

export const TaskSheet = ({store, onChange, onClose}: Props) => {
  const [name, setName] = useState('');

  const create = () => {
    void chromeStorageSink.createSession().then(onChange);
    setName('');
    onClose();
  };

  const activate = (id: string) => {
    void chromeStorageSink.activateSession(id).then(onChange);
    onClose();
  };

  return (
    <div class="sheet">
      <div class="sheet__new">
        <span class="sheet__plus">+</span>
        <input
          class="sheet__input"
          placeholder="New task name…"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') create();
            if (event.key === 'Escape') onClose();
          }}
          autofocus
        />
        <span class="sheet__enter">⏎</span>
      </div>

      <div class="sheet__group">OPEN · {store.sessions.length}</div>
      {store.sessions.map((session, position) => {
        const current = session.id === store.activeId;
        return (
          <button
            key={session.id}
            class={current ? 'sheet__row sheet__row--current' : 'sheet__row'}
            onClick={() => activate(session.id)}
          >
            <span class="sheet__status" />
            <span class="sheet__row-body">
              <span class="sheet__row-name">{session.label ?? `Task ${position + 1}`}</span>
              <span class="sheet__row-meta">
                {session.annotations.length} defect{session.annotations.length === 1 ? '' : 's'}
              </span>
            </span>
            {current ? <span class="sheet__row-tag">CURRENT</span> : null}
          </button>
        );
      })}

      <div class="sheet__foot">
        <span>⏎ create · esc close</span>
      </div>
    </div>
  );
};
