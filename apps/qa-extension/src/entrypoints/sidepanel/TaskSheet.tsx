import {useEffect, useState} from 'preact/hooks';
import {getAllSends, type SendRecord} from '../../jira/jira-history';
import {chromeStorageSink, type CaliperStore} from '../../sinks/chrome-storage.sink';

interface Props {
  store: CaliperStore;
  onChange: () => void;
  onClose: () => void;
}

const defectLabel = (count: number): string => `${count} defect${count === 1 ? '' : 's'}`;

export const TaskSheet = ({store, onChange, onClose}: Props) => {
  const [name, setName] = useState('');
  const [sends, setSends] = useState<SendRecord[]>([]);

  useEffect(() => {
    void getAllSends().then(setSends);
  }, []);

  const sentKey = (id: string): string | null =>
    sends.filter((record) => record.sessionId === id).at(-1)?.issueKey ?? null;

  const create = () => {
    void chromeStorageSink.createSession().then(onChange);
    setName('');
    onClose();
  };

  const activate = (id: string) => {
    void chromeStorageSink.activateSession(id).then(onChange);
    onClose();
  };

  const label = (id: string): string => {
    const session = store.sessions.find((item) => item.id === id);
    return session?.label ?? `Task ${store.sessions.findIndex((item) => item.id === id) + 1}`;
  };

  const open = store.sessions.filter((session) => session.id === store.activeId || sentKey(session.id) === null);
  const history = store.sessions.filter((session) => session.id !== store.activeId && sentKey(session.id) !== null);

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

      <div class="sheet__group">OPEN · {open.length}</div>
      {open.map((session) => {
        const current = session.id === store.activeId;
        return (
          <button
            key={session.id}
            class={current ? 'sheet__row sheet__row--current' : 'sheet__row'}
            onClick={() => activate(session.id)}
          >
            <span class="sheet__status" />
            <span class="sheet__row-body">
              <span class="sheet__row-name">{label(session.id)}</span>
              <span class="sheet__row-meta">{defectLabel(session.annotations.length)}</span>
            </span>
            {current ? <span class="sheet__row-tag">CURRENT</span> : null}
          </button>
        );
      })}

      {history.length > 0 ? (
        <>
          <div class="sheet__group">HISTORY · {history.length}</div>
          {history.map((session) => (
            <button
              key={session.id}
              class="sheet__row sheet__row--history"
              onClick={() => activate(session.id)}
            >
              <span class="sheet__status" />
              <span class="sheet__row-body">
                <span class="sheet__row-name">{label(session.id)}</span>
                <span class="sheet__row-meta">
                  {defectLabel(session.annotations.length)} · sent · {sentKey(session.id)}
                </span>
              </span>
            </button>
          ))}
        </>
      ) : null}

      <div class="sheet__foot">
        <span>⏎ create · esc close</span>
      </div>
    </div>
  );
};
