import {useEffect, useState} from 'preact/hooks';
import {clearCredentials, getConnection, saveCredentials, type JiraConnection} from '../../jira/jira-auth';
import {TOKEN_HELP_URL} from '../../jira/jira-config';
import {
  DEFAULT_TRACE_OPTIONS,
  readTraceOptions,
  writeTraceOptions,
  type TraceOptions,
} from '../../trace/options';

const MS_PER_SECOND = 1000;
const BITS_PER_KBIT = 1000;

const ATTACH_KEY = 'caliper.jira.attachAs';

interface Shortcut {
  name: string;
  description: string;
  shortcut: string;
}

export const App = () => {
  const [connection, setConnection] = useState<JiraConnection | null>(null);
  const [form, setForm] = useState({siteUrl: '', email: '', apiToken: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachAs, setAttachAs] = useState<'comment' | 'description'>('comment');
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [trace, setTrace] = useState<TraceOptions>(DEFAULT_TRACE_OPTIONS);

  useEffect(() => {
    void getConnection().then(setConnection);
    void readTraceOptions().then(setTrace);
    void chrome.storage.local.get(ATTACH_KEY).then((store) => {
      if (store[ATTACH_KEY] === 'description') setAttachAs('description');
    });
    void chrome.commands.getAll().then((commands) =>
      setShortcuts(
        commands
          .map((command) => ({
            name: command.name ?? '',
            description: command.description ?? '',
            shortcut: command.shortcut ?? '',
          }))
          .filter((command) => command.description),
      ),
    );
  }, []);

  const saveTrace = (patch: Partial<TraceOptions>): void => {
    const next = {...trace, ...patch};
    setTrace(next);
    void writeTraceOptions(next);
  };

  const connect = () => {
    setBusy(true);
    setError(null);
    saveCredentials(form)
      .then(setConnection)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  const disconnect = () => void clearCredentials().then(() => setConnection(null));

  const chooseAttach = (value: 'comment' | 'description') => {
    setAttachAs(value);
    void chrome.storage.local.set({[ATTACH_KEY]: value});
  };

  const ready = Boolean(form.siteUrl.trim() && form.email.trim() && form.apiToken.trim());
  const site = connection?.siteUrl.replace('https://', '') ?? '';

  return (
    <main class="opt">
      <h1 class="opt__title">Jira integration</h1>

      <section class="opt__card">
        <p class="opt__hint">
          Credentials stay in <code>chrome.storage.local</code> and reach Jira directly — no Caliper
          server is involved.
        </p>

        <div class="opt__grid">
          <label class="opt__field">
            <span>Site</span>
            <input
              value={form.siteUrl}
              placeholder="your-team"
              onInput={(event) => setForm({...form, siteUrl: event.currentTarget.value})}
            />
          </label>
          <label class="opt__field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              placeholder="you@company.com"
              onInput={(event) => setForm({...form, email: event.currentTarget.value})}
            />
          </label>
        </div>
        <label class="opt__field">
          <span>API token</span>
          <input
            type="password"
            value={form.apiToken}
            placeholder="••••••••••••"
            onInput={(event) => setForm({...form, apiToken: event.currentTarget.value})}
          />
        </label>
        <p class="opt__hint">
          Create one at{' '}
          <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
            id.atlassian.com → Security → API tokens
          </a>
          .
        </p>

        <span class="opt__label">Attach defects as</span>
        <div class="opt__seg">
          <button
            class={attachAs === 'comment' ? 'opt__seg-opt is-on' : 'opt__seg-opt'}
            onClick={() => chooseAttach('comment')}
          >
            Comment
          </button>
          <button
            class={attachAs === 'description' ? 'opt__seg-opt is-on' : 'opt__seg-opt'}
            onClick={() => chooseAttach('description')}
          >
            Description
          </button>
        </div>

        <span class="opt__label">Bug traces</span>

        <label class="opt__check">
          <input
            type="checkbox"
            checked={trace.redactSecrets}
            onChange={(event) => saveTrace({redactSecrets: event.currentTarget.checked})}
          />
          <span>Mask credentials in recorded network traffic</span>
        </label>
        <p class="opt__hint">
          Off by default: a trace is recorded complete, headers and bodies included. Turn this on when
          traces go to a tracker other people can read — it masks Authorization and Cookie headers and
          any password, token or secret field.
        </p>

        <label class="opt__check">
          <input
            type="checkbox"
            checked={trace.enableCdp}
            onChange={(event) => saveTrace({enableCdp: event.currentTarget.checked})}
          />
          <span>Use the debugger API for richer network capture</span>
        </label>
        <p class="opt__hint">
          Adds response bodies and stack traces. Chrome shows a debugging banner while recording, and it
          cannot attach while DevTools is open on the tab — Caliper falls back automatically and says so
          in the trace.
        </p>

        <label class="opt__field">
          <span>Maximum trace length (seconds)</span>
          <input
            type="number"
            min="10"
            value={Math.round(trace.maxDurationMs / MS_PER_SECOND)}
            onChange={(event) =>
              saveTrace({maxDurationMs: Number(event.currentTarget.value) * MS_PER_SECOND})
            }
          />
        </label>

        <label class="opt__field">
          <span>Video bitrate (kbps)</span>
          <input
            type="number"
            min="50"
            value={Math.round(trace.videoBitrate / BITS_PER_KBIT)}
            onChange={(event) =>
              saveTrace({videoBitrate: Number(event.currentTarget.value) * BITS_PER_KBIT})
            }
          />
        </label>
        <p class="opt__hint">
          250 kbps keeps a 30-second trace near 1 MB, which fits a Jira attachment comfortably.
        </p>

        <span class="opt__label">Shortcuts</span>
        <dl class="opt__keys">
          {shortcuts.map((item) => (
            <div key={item.name} class="opt__key-row">
              <dt class={item.shortcut ? 'opt__key' : 'opt__key opt__key--unset'}>
                {item.shortcut || 'unset'}
              </dt>
              <dd class="opt__key-label">{item.description}</dd>
            </div>
          ))}
        </dl>
        <button class="opt__linkbtn" onClick={() => void chrome.tabs.create({url: 'chrome://extensions/shortcuts'})}>
          Assign shortcuts →
        </button>

        {error ? <p class="opt__error">{error}</p> : null}
      </section>

      <footer class="opt__foot">
        <span class="opt__status">
          <span class={connection ? 'opt__status-dot' : 'opt__status-dot opt__status-dot--off'} />
          {connection ? `Connected · ${site}` : 'Not connected'}
        </span>
        {connection ? (
          <button class="btn" onClick={disconnect}>
            Reconnect
          </button>
        ) : (
          <button class="opt__submit opt__submit--inline" disabled={busy || !ready} onClick={connect}>
            {busy ? 'Verifying…' : 'Connect'}
          </button>
        )}
      </footer>
    </main>
  );
};
