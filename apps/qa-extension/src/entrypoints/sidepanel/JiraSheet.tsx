import {toToon} from '@caliper/core';
import type {CaliperSession} from '@caliper/core';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {copyToClipboard} from '../../export/export-session';
import {
  getConnection,
  issueUrl,
  JiraNotConnectedError,
  saveCredentials,
  type JiraConnection,
} from '../../jira/jira-auth';
import {TOKEN_HELP_URL} from '../../jira/jira-config';
import {resolveIssueKey, searchIssues, type IssueHit} from '../../jira/jira-client';
import {findCommentSend, getSends} from '../../jira/jira-history';
import {sendSessionToJira, type JiraTarget} from '../../jira/send-to-jira';
import {chromeStorageSink} from '../../sinks/chrome-storage.sink';

interface Props {
  session: CaliperSession;
  onClose: () => void;
}

type Phase = 'form' | 'sending' | 'done' | 'error';

const SEARCH_DEBOUNCE = 250;
const MIN_QUERY = 2;

export const JiraSheet = ({session, onClose}: Props) => {
  const [connection, setConnection] = useState<JiraConnection | null | undefined>(undefined);
  const [form, setForm] = useState({siteUrl: '', email: '', apiToken: ''});
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [issueKey, setIssueKey] = useState('');
  const [hits, setHits] = useState<IssueHit[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [target, setTarget] = useState<JiraTarget>('comment');
  const attach = true;
  const [existingCommentId, setExistingCommentId] = useState<string | null>(null);
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

  useEffect(() => {
    void getConnection().then(setConnection);
    void chrome.storage.local.get('caliper.jira.attachAs').then((store) => {
      if (store['caliper.jira.attachAs'] === 'description') setTarget('description');
    });
    void getSends(session.id).then((records) => {
      const keys = Array.from(new Set(records.map((record) => record.issueKey)));
      setRecent(keys);
      const last = records.at(-1);
      if (last) {
        setIssueKey(last.issueKey);
        setQuery(last.issueKey);
      }
    });
  }, [session.id]);

  useEffect(() => {
    if (!issueKey) {
      setExistingCommentId(null);
      return;
    }
    void findCommentSend(session.id, issueKey).then((record) => setExistingCommentId(record?.commentId ?? null));
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

  const pick = (key: string) => {
    setIssueKey(key);
    setQuery(key);
    setHits([]);
  };

  const willUpdate = target === 'comment' && existingCommentId !== null;

  const connect = () => {
    setConnecting(true);
    setConnectError(null);
    saveCredentials(form)
      .then(setConnection)
      .catch((cause) => setConnectError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setConnecting(false));
  };

  const copyToonAndClose = () => void copyToClipboard(toToon(session)).then(onClose);

  const newTask = () => void chromeStorageSink.createSession().then(onClose);

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

  const site = connection?.siteUrl.replace('https://', '') ?? '';
  const defectLabel = `${session.annotations.length} defect${session.annotations.length === 1 ? '' : 's'}`;
  const shotLabel = `${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}`;
  const matched = hits.find((hit) => hit.key === issueKey);

  // ── 05 · connect ─────────────────────────────────────
  const connectScreen = () => (
    <>
      <div class="jira__bar">
        <button class="jira__back" title="Back" onClick={onClose}>
          ←
        </button>
        <span class="jira__title">Send to Jira</span>
        <button class="jira__close" title="Close" onClick={onClose}>
          esc
        </button>
      </div>
      <div class="jira__panel">
        <h3 class="jira__head">Connect Jira once</h3>
        <p class="jira__lead">
          Your token stays in <code>chrome.storage.local</code> and reaches Jira directly — no Caliper
          server is involved.
        </p>

        <label class="jira__label">Site</label>
        <input
          class="jira__input"
          value={form.siteUrl}
          placeholder="your-team  (or your-team.atlassian.net)"
          onInput={(event) => setForm({...form, siteUrl: event.currentTarget.value})}
        />
        <label class="jira__label">Email</label>
        <input
          class="jira__input"
          type="email"
          value={form.email}
          placeholder="you@company.com"
          onInput={(event) => setForm({...form, email: event.currentTarget.value})}
        />
        <label class="jira__label">API token</label>
        <input
          class="jira__input"
          type="password"
          value={form.apiToken}
          placeholder="••••••••••••"
          onInput={(event) => setForm({...form, apiToken: event.currentTarget.value})}
        />
        <p class="jira__helper">
          Create one at{' '}
          <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
            id.atlassian.com → Security
          </a>
          .
        </p>

        <div class="jira__waiting">
          <span class="jira__waiting-label">WAITING TO SEND</span>
          <span class="jira__waiting-line">
            {defectLabel} · {shotLabel} · 1 comment
          </span>
        </div>

        <button
          class="jira__send"
          disabled={connecting || !(form.siteUrl.trim() && form.email.trim() && form.apiToken.trim())}
          onClick={connect}
        >
          {connecting ? 'Verifying…' : 'Connect & continue'}
        </button>
        {connectError ? <p class="jira__error">{connectError}</p> : null}
        <div class="jira__alt">
          <span>no account?</span>
          <button class="jira__link-btn" onClick={copyToonAndClose}>
            copy TOON instead →
          </button>
        </div>
      </div>
    </>
  );

  // ── 06 · pick the issue ──────────────────────────────
  const pickScreen = () => (
    <>
      <div class="jira__bar">
        <button class="jira__back" title="Back" onClick={onClose}>
          ←
        </button>
        <span class="jira__title">Send {defectLabel}</span>
        <span class="jira__site">
          <span class="jira__dot" />
          {site}
        </span>
      </div>
      <div class="jira__panel">
        <div class="jira__search">
          <span class="jira__search-icon">⌕</span>
          <input
            class="jira__search-input"
            value={query}
            placeholder="key or URL"
            onInput={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              setIssueKey(resolveIssueKey(value));
              scheduleSearch(value);
            }}
          />
        </div>

        {matched ? (
          <>
            <span class="jira__group">MATCH</span>
            <button class="jira__match" onClick={() => pick(matched.key)}>
              <span class="jira__match-key">{matched.key}</span>
              <span class="jira__match-sum">{matched.summary}</span>
            </button>
          </>
        ) : null}

        {hits.filter((hit) => hit.key !== issueKey).length > 0 ? (
          <>
            <span class="jira__group">RESULTS</span>
            {hits
              .filter((hit) => hit.key !== issueKey)
              .slice(0, 5)
              .map((hit) => (
                <button key={hit.key} class="jira__row" onClick={() => pick(hit.key)}>
                  <span class="jira__row-title">{hit.summary}</span>
                  <span class="jira__row-key">{hit.key}</span>
                </button>
              ))}
          </>
        ) : recent.length > 0 ? (
          <>
            <span class="jira__group">RECENT</span>
            {recent.slice(0, 4).map((key) => (
              <button key={key} class="jira__row" onClick={() => pick(key)}>
                <span class="jira__row-title">{key}</span>
                <span class="jira__row-key">used before</span>
              </button>
            ))}
          </>
        ) : null}

        <span class="jira__group">ADD AS</span>
        <div class="jira__seg">
          <button
            class={`jira__seg-opt${target === 'comment' ? ' is-on' : ''}`}
            onClick={() => setTarget('comment')}
          >
            Comment
          </button>
          <button
            class={`jira__seg-opt${target === 'description' ? ' is-on' : ''}`}
            onClick={() => setTarget('description')}
          >
            Description
          </button>
        </div>
        <p class="jira__note">
          {target === 'description'
            ? "Replaces the issue's current description."
            : 'Screenshots embed inline in the comment.'}
        </p>

        {target === 'comment' && existingCommentId ? (
          <p class="jira__note">A comment was already sent to {issueKey} — it will be updated.</p>
        ) : null}
      </div>

      <div class="jira__foot">
        <button class="jira__send" disabled={!issueKey} onClick={send}>
          {willUpdate ? `Update ${issueKey}` : `Send to ${issueKey || '…'}`}
        </button>
        <span class="jira__foot-meta">
          1 {target} · {attach ? shotLabel : '0 screenshots'}
        </span>
      </div>
    </>
  );

  // ── 07 · sending & result ────────────────────────────
  const sendingScreen = () => {
    const total = progress?.total ?? screenshotCount;
    const done = progress?.done ?? 0;
    const shots = session.annotations.filter(
      (annotation) => annotation.screenshotId && session.assets[annotation.screenshotId] !== undefined,
    );
    return (
      <>
        <div class="jira__bar">
          <span class="jira__title">Sending…</span>
        </div>
        <div class="jira__panel">
          <div class="jira__progress-head">
            <span>attachments</span>
            <span>
              {done} / {total}
            </span>
          </div>
          <div class="jira__track">
            <div class="jira__fill" style={{width: `${total > 0 ? (done / total) * 100 : 100}%`}} />
          </div>
          <ul class="jira__checklist">
            {shots.map((annotation, index) => (
              <li key={annotation.id} class="jira__check-row">
                <span class={index < done ? 'jira__check--done' : index === done ? 'jira__check--now' : 'jira__check--wait'}>
                  {index < done ? '✓' : index === done ? '↑' : '·'}
                </span>
                caliper-{String(index + 1).padStart(2, '0')}.png
              </li>
            ))}
          </ul>
          <p class="jira__note">Leaving the panel does not cancel the upload.</p>
        </div>
      </>
    );
  };

  const doneScreen = () => (
    <>
      <div class="jira__bar jira__bar--ok">
        <span class="jira__title">✓ {wasUpdate ? 'Updated' : 'Sent to'} {issueKey}</span>
        <button class="jira__close" title="Close" onClick={onClose}>
          esc
        </button>
      </div>
      <div class="jira__panel">
        <div class="jira__receipt">
          <span class="jira__receipt-k">CMT</span>
          <span class="jira__receipt-v">{target === 'comment' ? (wasUpdate ? 'updated' : 'posted') : '—'}</span>
          <span class="jira__receipt-k">ATT</span>
          <span class="jira__receipt-v">{attach ? shotLabel : '0'}</span>
          <span class="jira__receipt-k">AT</span>
          <span class="jira__receipt-v">just now</span>
        </div>
        <div class="jira__actions">
          {resultUrl ? (
            <a class="jira__ghost" href={resultUrl} target="_blank" rel="noreferrer">
              Open issue ↗
            </a>
          ) : null}
          <button class="jira__ghost jira__ghost--teal" onClick={newTask}>
            New task
          </button>
        </div>
      </div>
    </>
  );

  const errorScreen = () => (
    <>
      <div class="jira__bar">
        <button class="jira__back" title="Back" onClick={() => setPhase('form')}>
          ←
        </button>
        <span class="jira__title">Send failed</span>
        <button class="jira__close" title="Close" onClick={onClose}>
          esc
        </button>
      </div>
      <div class="jira__panel">
        <p class="jira__error">{error}</p>
        <button class="jira__send" onClick={send}>
          Retry
        </button>
      </div>
    </>
  );

  const screen = () => {
    if (connection === undefined) return null;
    if (connection === null) return connectScreen();
    if (phase === 'sending') return sendingScreen();
    if (phase === 'done') return doneScreen();
    if (phase === 'error') return errorScreen();
    return pickScreen();
  };

  return <div class="jira">{screen()}</div>;
};
