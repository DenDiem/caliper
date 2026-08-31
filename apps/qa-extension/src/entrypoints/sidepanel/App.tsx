import {toToon} from '@caliper/core';
import type {CaliperAnnotation} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {copyToClipboard, downloadSessionArchive, exportSession} from '../../export/export-session';
import {getConnection, type JiraConnection} from '../../jira/jira-auth';
import {STORAGE} from '../../jira/jira-config';
import {getSends} from '../../jira/jira-history';
import {chromeStorageSink, type CaliperStore} from '../../sinks/chrome-storage.sink';
import {disarmPicker} from './arm';
import {DefectCard} from './DefectCard';
import {EmptyState} from './EmptyState';
import {JiraSheet} from './JiraSheet';
import {PanelFooter} from './PanelFooter';
import {RecordBar} from './RecordBar';
import {TraceCard} from './TraceCard';
import {TaskSheet} from './TaskSheet';
import {TitleBar} from './TitleBar';

export const App = () => {
  const [store, setStore] = useState<CaliperStore | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [taskSheet, setTaskSheet] = useState(false);
  const [jiraSheet, setJiraSheet] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [connection, setConnection] = useState<JiraConnection | null>(null);
  const [issueKeys, setIssueKeys] = useState<string[]>([]);

  const refresh = () => void chromeStorageSink.readStore().then(setStore);

  const copy = (label: string, text: string) => {
    void copyToClipboard(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  useEffect(() => {
    refresh();
    const listener = () => refresh();
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  const activeId = store?.activeId;

  useEffect(() => {
    if (!activeId) return undefined;
    const load = () => {
      void getConnection().then(setConnection);
      void getSends(activeId).then((sends) => setIssueKeys(sends.map((record) => record.issueKey)));
    };
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (STORAGE.connection in changes || STORAGE.sends in changes) load();
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [activeId]);

  useEffect(() => {
    const disarm = () => void disarmPicker();
    const onVisibility = () => {
      if (document.hidden) disarm();
    };
    window.addEventListener('pagehide', disarm);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', disarm);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!store) return <div class="panel" />;

  const session = store.sessions.find((item) => item.id === store.activeId) ?? store.sessions[0];
  const {annotations, traces} = session;
  const taskName =
    session.label ?? `Task ${store.sessions.findIndex((item) => item.id === session.id) + 1}`;

  const shot = (annotation: CaliperAnnotation): string | undefined =>
    annotation.screenshotId ? session.assets[annotation.screenshotId] : undefined;

  const isRemove = (annotation: CaliperAnnotation): boolean => annotation.intent === 'remove';
  const hueOf = (annotation: CaliperAnnotation): string =>
    annotation.severity === 'blocker' || annotation.severity === 'major' ? annotation.severity : 'minor';

  const sevCount = (hue: string): number =>
    annotations.filter((annotation) => !isRemove(annotation) && hueOf(annotation) === hue).length;
  const removeCount = annotations.filter(isRemove).length;

  const shown = annotations.filter((annotation) => {
    if (!filter) return true;
    if (filter === 'remove') return isRemove(annotation);
    return !isRemove(annotation) && hueOf(annotation) === filter;
  });

  const toggleFilter = (value: string) => setFilter(filter === value ? null : value);
  const chipClass = (value: string) =>
    `count__chip count__chip--${value}${filter === value ? ' count__chip--on' : ''}`;

  const linkedKey = issueKeys.at(-1) ?? null;
  const jiraLabel = !connection ? 'CONNECT JIRA' : issueKeys.length > 0 ? 'UPDATE JIRA' : 'SEND JIRA';

  const onJira = () => {
    if (connection) setJiraSheet(true);
    else void chrome.runtime.openOptionsPage();
  };

  const card = (annotation: CaliperAnnotation) => (
    <DefectCard
      key={annotation.id}
      annotation={annotation}
      index={annotations.indexOf(annotation)}
      screenshot={shot(annotation)}
      onRemove={() => void chromeStorageSink.remove(annotation.id).then(refresh)}
    />
  );

  return (
    <div class="panel">
      <TitleBar jiraKey={linkedKey} />

      <RecordBar />

      <button class={taskSheet ? 'chip chip--open' : 'chip'} onClick={() => setTaskSheet(!taskSheet)}>
        <div class="chip__body">
          <div class="chip__label">TASK</div>
          <div class="chip__name">{taskName}</div>
        </div>
        <span class="chip__caret">{taskSheet ? '▴' : '▾'}</span>
      </button>

      {taskSheet ? (
        <TaskSheet store={store} onChange={refresh} onClose={() => setTaskSheet(false)} />
      ) : annotations.length === 0 && traces.length === 0 ? (
        <EmptyState connected={!!connection} onConnect={() => void chrome.runtime.openOptionsPage()} />
      ) : (
        <>
          <div class="count">
            <div>
              <span class="count__num">{annotations.length}</span>
              <span class="count__unit">defect{annotations.length === 1 ? '' : 's'}</span>
              {traces.length > 0 ? (
                <span class="count__unit">
                  {' '}
                  · {traces.length} trace{traces.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <div class="count__sev">
              <button class={chipClass('blocker')} onClick={() => toggleFilter('blocker')}>
                {sevCount('blocker')}
              </button>
              <button class={chipClass('major')} onClick={() => toggleFilter('major')}>
                {sevCount('major')}
              </button>
              <button class={chipClass('minor')} onClick={() => toggleFilter('minor')}>
                {sevCount('minor')}
              </button>
              {removeCount > 0 ? (
                <button class={chipClass('remove')} onClick={() => toggleFilter('remove')}>
                  ✕ {removeCount}
                </button>
              ) : null}
            </div>
          </div>

          <ul class="list">
            {traces.map((trace) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                onRename={(id, label) => void chromeStorageSink.renameTrace(id, label).then(refresh)}
                onRemove={(id) => void chromeStorageSink.removeTrace(id).then(refresh)}
              />
            ))}
            {shown.map(card)}
          </ul>
        </>
      )}

      {!taskSheet && (annotations.length > 0 || traces.length > 0) ? (
        <PanelFooter
          copied={copied}
          jiraLabel={jiraLabel}
          onCopyToon={() => copy('toon', toToon(session))}
          onJira={onJira}
          onJson={() => copy('json', exportSession(session, {withAssets: false}))}
          onZip={() => void downloadSessionArchive(session)}
          onClear={() => void chromeStorageSink.clear().then(refresh)}
        />
      ) : null}

      {jiraSheet ? <JiraSheet session={session} onClose={() => setJiraSheet(false)} /> : null}
    </div>
  );
};
