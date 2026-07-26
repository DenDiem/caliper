import {useEffect, useState} from 'preact/hooks';
import {clearCredentials, getConnection, saveCredentials, type JiraConnection} from '../../jira/jira-auth';
import {TOKEN_HELP_URL} from '../../jira/jira-config';

export const App = () => {
  const [connection, setConnection] = useState<JiraConnection | null>(null);
  const [form, setForm] = useState({siteUrl: '', email: '', apiToken: ''});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => void getConnection().then(setConnection), []);

  const connect = () => {
    setBusy(true);
    setError(null);
    saveCredentials(form)
      .then(setConnection)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  };

  const disconnect = () => void clearCredentials().then(() => setConnection(null));

  const ready = Boolean(form.siteUrl.trim() && form.email.trim() && form.apiToken.trim());

  return (
    <main class="opt">
      <h1 class="opt__title">Jira integration</h1>

      {connection ? (
        <section class="opt__card">
          <p class="opt__connected">
            Connected to <strong>{connection.siteUrl.replace('https://', '')}</strong> as {connection.displayName}
          </p>
          <button class="btn btn--danger" onClick={disconnect}>
            Disconnect
          </button>
        </section>
      ) : (
        <section class="opt__card">
          <label class="opt__field">
            <span>Site</span>
            <input
              value={form.siteUrl}
              placeholder="your-team  (or your-team.atlassian.net)"
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
            Create a token at{' '}
            <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
              id.atlassian.com → Security → API tokens
            </a>
            . It is stored only in this browser and used to reach your Jira directly — no Caliper server is involved.
          </p>

          <button class="opt__submit" disabled={busy || !ready} onClick={connect}>
            {busy ? 'Verifying…' : 'Connect'}
          </button>
          {error ? <p class="opt__error">{error}</p> : null}
        </section>
      )}
    </main>
  );
};
