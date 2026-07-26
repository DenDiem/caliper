import {chromeStorageSink, type CaliperStore} from '../../sinks/chrome-storage.sink';

interface Props {
  store: CaliperStore;
  onChange: () => void;
}

export const TaskBar = ({store, onChange}: Props) => {
  const create = () => void chromeStorageSink.createSession().then(onChange);
  const remove = () => void chromeStorageSink.removeSession(store.activeId).then(onChange);
  const activate = (id: string) => void chromeStorageSink.activateSession(id).then(onChange);

  return (
    <div class="tasks">
      <select
        class="tasks__select"
        value={store.activeId}
        onChange={(event) => activate(event.currentTarget.value)}
      >
        {store.sessions.map((session, position) => (
          <option key={session.id} value={session.id}>
            Task {position + 1} · {session.annotations.length} defect{session.annotations.length === 1 ? '' : 's'}
          </option>
        ))}
      </select>

      <button class="tasks__btn" title="New task" onClick={create}>
        ＋
      </button>
      {store.sessions.length > 1 ? (
        <button class="tasks__btn tasks__btn--danger" title="Delete this task" onClick={remove}>
          🗑
        </button>
      ) : null}
    </div>
  );
};
