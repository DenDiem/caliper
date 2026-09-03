import {useEffect, useState} from 'preact/hooks';
import {toToon} from '@caliper/core';
import {copyToClipboard, downloadSessionArchive} from '../../export/export-session';
import {getConnection, type JiraConnection} from '../../jira/jira-auth';
import {chromeStorageSink, type CaliperStore} from '../../sinks/chrome-storage.sink';
import {activeSession} from '../../sinks/store';
import {DefectCard} from '../sidepanel/DefectCard';
import {JiraSheet} from '../sidepanel/JiraSheet';
import {TaskSheet} from '../sidepanel/TaskSheet';
import {TraceCard} from '../sidepanel/TraceCard';

interface Props {
  focusId: string | null;
  onOpenTrace: (traceId: string) => void;
}

// Everything the panel does except the two things that only make sense against a live tab: starting a
// recording and arming the picker. Those stay in the panel; this is where the result is read, sorted
// and sent on.
export const SessionView = ({focusId, onOpenTrace}: Props) => {
  const [store, setStore] = useState<CaliperStore | null>(null);
  const [connection, setConnection] = useState<JiraConnection | null>(null);
  const [taskSheet, setTaskSheet] = useState(false);
  const [jiraSheet, setJiraSheet] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = () => void chromeStorageSink.readStore().then(setStore);

  useEffect(() => {
    refresh();
    void getConnection().then(setConnection);
    const listener = () => refresh();
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  // Arriving from a defect card in the panel: the list can be long, so the card it was opened for is
  // brought into view rather than left to be hunted for.
  useEffect(() => {
    if (!focusId || !store) return;
    const card = document.getElementById(`defect-${focusId}`);
    card?.scrollIntoView({block: 'center'});
    card?.classList.add('card--focus');
  }, [focusId, store]);

  if (!store) return <main class="page" />;

  const session = activeSession(store);
  const {annotations, traces} = session;
  const index = store.sessions.findIndex((item) => item.id === store.activeId);
  const taskName = session.label ?? `Task ${index + 1}`;

  const copy = () => {
    void copyToClipboard(toToon(session)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <main class="page">
      <header class="ws-head">
        <div>
          <h1 class="ws-title">{taskName}</h1>
          <span class="head__meta">
            {annotations.length} defect{annotations.length === 1 ? '' : 's'} · {traces.length} trace
            {traces.length === 1 ? '' : 's'}
          </span>
        </div>

        <div class="ws-actions">
          <button class="ws-btn" onClick={() => setTaskSheet(!taskSheet)}>
            {taskSheet ? 'Close tasks' : 'Switch task'}
          </button>
          <button class="ws-btn" onClick={() => void chromeStorageSink.createSession().then(refresh)}>
            New task
          </button>
          <button class="ws-btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy for agent'}
          </button>
          <button class="ws-btn" onClick={() => void downloadSessionArchive(session)}>
            Download zip
          </button>
          <button
            class="ws-btn ws-btn--primary"
            onClick={() =>
              connection ? setJiraSheet(true) : void chrome.runtime.openOptionsPage()
            }
          >
            {connection ? 'Send to Jira' : 'Connect Jira'}
          </button>
        </div>
      </header>

      {taskSheet ? (
        <TaskSheet store={store} onChange={refresh} onClose={() => setTaskSheet(false)} />
      ) : null}

      {annotations.length === 0 && traces.length === 0 ? (
        <p class="empty">
          Nothing recorded in this task yet. Mark a defect or record a trace from the side panel.
        </p>
      ) : (
        <ul class="list">
          {traces.map((trace, position) => (
            <TraceCard
              key={trace.id}
              trace={trace}
              index={position}
              onOpen={onOpenTrace}
              onRename={(id, label) => void chromeStorageSink.renameTrace(id, label).then(refresh)}
              onRemove={(id) => void chromeStorageSink.removeTrace(id).then(refresh)}
            />
          ))}
          {annotations.map((annotation, position) => (
            <DefectCard
              key={annotation.id}
              id={`defect-${annotation.id}`}
              annotation={annotation}
              index={position}
              screenshot={
                annotation.screenshotId ? session.assets[annotation.screenshotId] : undefined
              }
              onOpen={(defectId) => (location.hash = `#defect/${defectId}`)}
              onRemove={() => void chromeStorageSink.remove(annotation.id).then(refresh)}
            />
          ))}
        </ul>
      )}

      {jiraSheet ? <JiraSheet session={session} onClose={() => setJiraSheet(false)} /> : null}
    </main>
  );
};
