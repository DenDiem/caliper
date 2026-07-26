import type {CaliperSession} from '@caliper/core';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {getConnection, issueUrl, JiraNotConnectedError, type JiraConnection} from '../../jira/jira-auth';
import {resolveIssueKey, searchIssues, type IssueHit} from '../../jira/jira-client';
import {findCommentSend} from '../../jira/jira-history';
import {sendSessionToJira, type JiraTarget} from '../../jira/send-to-jira';

interface Props {
  session: CaliperSession;
  onClose: () => void;
}

type Phase = 'form' | 'sending' | 'done' | 'error';

const SEARCH_DEBOUNCE = 250;
const MIN_QUERY = 2;

export const JiraSheet = ({session, onClose}: Props) => {
  const [connection, setConnection] = useState<JiraConnection | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [issueKey, setIssueKey] = useState('');
  const [hits, setHits] = useState<IssueHit[]>([]);
  const [target, setTarget] = useState<JiraTarget>('comment');
  const [attach, setAttach] = useState(true);
  const [existingCommentId, setExistingCommentId] = useState<string | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState<{done: number; total: number} | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [wasUpdate, setWasUpdate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timer = useRef<number>();

  const screenshotCount = useMemo(
    () =>
      session.annotations.filter(
        (annotation) =>
          annotation.screenshotId !== undefined && session.assets[annotation.screenshotId] !== undefined,
      ).length,
    [session],
  );

  useEffect(() => void getConnection().then(setConnection), []);

  useEffect(() => {
    if (!issueKey) {
      setExistingCommentId(null);
      return;
    }
    void findCommentSend(session.id, issueKey).then((record) => {
      setExistingCommentId(record?.commentId ?? null);
      setUpdateExisting(record?.commentId != null);
    });
  }, [issueKey, session.id]);

  const scheduleSearch = (value: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (value.trim().length < MIN_QUERY) {
        setHits([]);
        return;
      }
      searchIssues(value)
        .then(setHits)
        .catch((cause) => {
          setHits([]);
          if (cause instanceof JiraNotConnectedError) setConnection(null);
        });
    }, SEARCH_DEBOUNCE);
  };

  const pick = (hit: IssueHit) => {
    setIssueKey(hit.key);
    setQuery(hit.key);
    setHits([]);
  };

  const willUpdate = target === 'comment' && updateExisting && existingCommentId !== null;

  const send = () => {
    setPhase('sending');
    setError(null);
    setProgress({done: 0, total: screenshotCount});
    setWasUpdate(willUpdate);
    sendSessionToJira(session, {
      issueKey,
      target,
      attachScreenshots: attach,
      updateCommentId: willUpdate ? existingCommentId : null,
      onProgress: (done, total) => setProgress({done, total}),
    })
      .then(() => issueUrl(issueKey))
      .then((url) => {
        setResultUrl(url);
        setPhase('done');
      })
      .catch((cause) => {
        if (cause instanceof JiraNotConnectedError) {
          setConnection(null);
          setPhase('form');
          return;
        }
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase('error');
      });
  };

  const body = () => {
    if (connection === undefined) return null;

    if (connection === null) {
      return (
        <div class="jira__notice">
          <p>Connect Jira to send defects straight into a ticket.</p>
          <button class="jira__send" onClick={() => void chrome.runtime.openOptionsPage()}>
            Open settings
          </button>
        </div>
      );
    }

    if (phase === 'done') {
      return (
        <div class="jira__notice">
          <p class="jira__ok">
            {wasUpdate ? 'Updated' : 'Sent to'} {issueKey} ✓
          </p>
          {resultUrl ? (
            <a class="jira__link" href={resultUrl} target="_blank" rel="noreferrer">
              Open {issueKey} ↗
            </a>
          ) : null}
          <button class="jira__ghost" onClick={onClose}>
            Done
          </button>
        </div>
      );
    }

    const sending = phase === 'sending';
    const uploading = progress !== null && progress.total > 0 && progress.done < progress.total;
    const action = willUpdate ? `Update ${issueKey}` : `Send to ${issueKey || '…'}`;

    return (
      <>
        <label class="jira__label">Issue</label>
        <input
          class="jira__input"
          value={query}
          placeholder="OM-1234 or paste an issue URL"
          disabled={sending}
          onInput={(event) => {
            const value = event.currentTarget.value;
            setQuery(value);
            setIssueKey(resolveIssueKey(value));
            scheduleSearch(value);
          }}
        />
        {hits.length > 0 ? (
          <ul class="jira__hits">
            {hits.slice(0, 6).map((hit) => (
              <li key={hit.key}>
                <button class="jira__hit" onClick={() => pick(hit)}>
                  <span class="jira__hit-key">{hit.key}</span>
                  <span class="jira__hit-sum">{hit.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <label class="jira__label">Add as</label>
        <div class="jira__seg">
          <button
            class={`jira__seg-opt${target === 'comment' ? ' is-on' : ''}`}
            disabled={sending}
            onClick={() => setTarget('comment')}
          >
            Comment
          </button>
          <button
            class={`jira__seg-opt${target === 'description' ? ' is-on' : ''}`}
            disabled={sending}
            onClick={() => setTarget('description')}
          >
            Description
          </button>
        </div>
        {target === 'description' ? (
          <p class="jira__note">Replaces the issue's current description.</p>
        ) : null}

        {target === 'comment' && existingCommentId ? (
          <label class="jira__check">
            <input
              type="checkbox"
              checked={updateExisting}
              disabled={sending}
              onChange={(event) => setUpdateExisting(event.currentTarget.checked)}
            />
            Update the comment already sent to {issueKey}
          </label>
        ) : null}

        {screenshotCount > 0 ? (
          <label class="jira__check">
            <input
              type="checkbox"
              checked={attach}
              disabled={sending}
              onChange={(event) => setAttach(event.currentTarget.checked)}
            />
            Embed {screenshotCount} screenshot{screenshotCount === 1 ? '' : 's'}
          </label>
        ) : null}

        <p class="jira__summary">
          {session.annotations.length} defect{session.annotations.length === 1 ? '' : 's'}
          {attach && screenshotCount > 0 ? ` · ${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}` : ''}
        </p>

        <button class="jira__send" disabled={!issueKey || sending} onClick={send}>
          {sending ? (uploading ? `Uploading ${progress.done}/${progress.total}…` : 'Posting…') : action}
        </button>
        {phase === 'error' && error ? <p class="jira__error">{error}</p> : null}
      </>
    );
  };

  return (
    <div class="jira">
      <div class="jira__bar">
        <span class="jira__title">{willUpdate ? 'Update Jira' : 'Send to Jira'}</span>
        <button class="jira__close" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div class="jira__panel">{body()}</div>
    </div>
  );
};
