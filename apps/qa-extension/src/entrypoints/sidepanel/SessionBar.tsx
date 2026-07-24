import type {CaliperSession} from '@caliper/core';
import {parseTask} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {chromeSessionHistory} from '../../sinks/chrome-storage.sink';

interface SessionBarProps {
  session: CaliperSession;
  sessions: readonly CaliperSession[];
  onChanged: () => void;
}

const shortDate = (iso: string): string => iso.slice(5, 10).replace('-', '/');

const describe = (session: CaliperSession): string => {
  const count = session.annotations.length;
  const name = session.task?.key ?? 'no task';
  return `${name} · ${count} · ${shortDate(session.createdAt)}`;
};

export const SessionBar = ({session, sessions, onChanged}: SessionBarProps) => {
  const [draft, setDraft] = useState(session.task?.url ?? session.task?.key ?? '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(session.task?.url ?? session.task?.key ?? '');
    setInvalid(false);
  }, [session.id, session.task?.key, session.task?.url]);

  const commit = () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      setInvalid(false);
      void chromeSessionHistory.setTask(null).then(onChanged);
      return;
    }

    const parsed = parseTask(trimmed);
    if (!parsed) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    void chromeSessionHistory.setTask({key: parsed.key, url: parsed.url}).then(onChanged);
  };

  return (
    <div class="session">
      <div class="session__row">
        <select
          class="session__pick"
          value={session.id}
          onChange={(event) =>
            void chromeSessionHistory.activate(event.currentTarget.value).then(onChanged)
          }
        >
          {sessions.map((item) => (
            <option key={item.id} value={item.id}>
              {describe(item)}
            </option>
          ))}
        </select>

        <button
          class="session__new"
          title="Start a new session"
          onClick={() => void chromeSessionHistory.start(null).then(onChanged)}
        >
          + new
        </button>
      </div>

      <input
        class={`session__task${invalid ? ' session__task--invalid' : ''}`}
        type="text"
        placeholder="Jira issue URL or key"
        value={draft}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />

      {invalid ? <span class="session__hint">Expected a Jira link or a key like OM-4110</span> : null}

      {session.task?.url && !invalid ? (
        <a class="session__link" href={session.task.url} target="_blank" rel="noreferrer">
          open {session.task.key} →
        </a>
      ) : null}
    </div>
  );
};
