import type {CaliperSession} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {getConnection, type JiraConnection} from '../../jira/jira-auth';
import {STORAGE} from '../../jira/jira-config';
import {getSends, type SendRecord} from '../../jira/jira-history';

interface Props {
  session: CaliperSession;
  onSend: () => void;
}

export const JiraBar = ({session, onSend}: Props) => {
  const [connection, setConnection] = useState<JiraConnection | null | undefined>(undefined);
  const [sends, setSends] = useState<SendRecord[]>([]);

  const hasDefects = session.annotations.length > 0;

  useEffect(() => {
    const load = () => {
      void getConnection().then(setConnection);
      void getSends(session.id).then(setSends);
    };
    load();
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (STORAGE.connection in changes || STORAGE.sends in changes) load();
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, [session.id]);

  if (connection === undefined) return null;

  if (connection === null) {
    return (
      <button class="jira-bar jira-bar--connect" onClick={() => void chrome.runtime.openOptionsPage()}>
        Connect Jira →
      </button>
    );
  }

  const issues = Array.from(new Set(sends.map((record) => record.issueKey)));

  return (
    <div class="jira-zone">
      {issues.length > 0 ? <p class="jira-sent">Sent · {issues.join(', ')}</p> : null}

      {hasDefects ? (
        <button class="jira-cta" onClick={onSend}>
          {sends.length > 0 ? 'Update Jira →' : 'Send to Jira →'}
        </button>
      ) : issues.length === 0 ? (
        <div class="jira-bar jira-bar--status">
          <span class="jira-bar__dot" />
          Jira · {connection.siteUrl.replace('https://', '')}
        </div>
      ) : null}
    </div>
  );
};
