import {useEffect, useState} from 'preact/hooks';
import type {CaliperTrace, TraceConsoleEntry, TraceDetail, TraceNetworkEntry} from '@caliper/core';
import {traceDetailSchema, truncationNote} from '@caliper/core';
import {getBlob} from '../../trace/blob-store';
import {readStore} from '../../sinks/store';

const MS_PER_SECOND = 1000;
const MAX_TEXT = 300;

// Deliberately not the whole trace: the point of this page is the two things a person scans for --
// what threw, and which calls failed. Everything else is what `caliper trace` is for.
const isError = (entry: TraceConsoleEntry): boolean => entry.level === 'error';

const clip = (value: string): string =>
  value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;

const stamp = (t: number): string => `${(t / MS_PER_SECOND).toFixed(1)}s`;

const path = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

const statusLabel = (entry: TraceNetworkEntry): string =>
  entry.failed && entry.status === 0 ? 'failed' : String(entry.status);

const ConsoleRow = ({entry}: {entry: TraceConsoleEntry}) => (
  <li class={isError(entry) ? 'row row--bad' : 'row'}>
    <span class="row__t">{stamp(entry.t)}</span>
    <span class="row__level">{entry.level}</span>
    <div class="row__body">
      <div class="row__text">{clip(entry.text)}</div>
      {entry.stack ? <pre class="row__stack">{clip(entry.stack)}</pre> : null}
    </div>
  </li>
);

const NetworkRow = ({entry}: {entry: TraceNetworkEntry}) => (
  <li class={entry.failed ? 'row row--bad' : 'row'}>
    <span class="row__t">{stamp(entry.t)}</span>
    <span class="row__method">{entry.method}</span>
    <span class={entry.failed ? 'row__status row__status--bad' : 'row__status'}>
      {statusLabel(entry)}
    </span>
    <span class="row__url" title={entry.url}>
      {path(entry.url)}
    </span>
    <span class="row__ms">{Math.round(entry.durationMs)}ms</span>
    {entry.failed && entry.responseBody ? (
      <div class="row__why">{clip(entry.responseBody)}</div>
    ) : null}
  </li>
);

export const App = () => {
  const [trace, setTrace] = useState<CaliperTrace | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return setMissing(true);

    void (async () => {
      const store = await readStore();
      const found = store.sessions.flatMap((session) => session.traces).find((item) => item.id === id);
      if (!found) return setMissing(true);
      setTrace(found);
      document.title = `${found.label} — Caliper trace`;

      setVideo((await getBlob(`${id}:video`)) ?? null);
      const raw = await getBlob(`${id}:detail`);
      if (raw) {
        const parsed = traceDetailSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setDetail(parsed.data);
      }
    })();
  }, []);

  if (missing) {
    return (
      <main class="page">
        <p class="empty">
          This trace is no longer in the extension&rsquo;s storage — it was deleted, or its task was.
        </p>
      </main>
    );
  }
  if (!trace) return <main class="page" />;

  const errors = (detail?.console ?? []).filter(isError);
  const network = detail?.network ?? [];
  const failed = network.filter((entry) => entry.failed);

  return (
    <main class="page">
      <header class="head">
        <h1 class="head__title">{trace.label}</h1>
        <span class="head__meta">
          {(trace.durationMs / MS_PER_SECOND).toFixed(1)}s · {trace.summary.steps} steps ·{' '}
          {errors.length} console error{errors.length === 1 ? '' : 's'} · {failed.length} failed
          request{failed.length === 1 ? '' : 's'}
        </span>
        {trace.truncated ? <p class="note">{truncationNote(trace)}</p> : null}
        {trace.sources.network === 'fallback' ? (
          <p class="note">
            Network captured without the debugger — response bodies are missing, and requests made
            through XMLHttpRequest were not seen at all. An empty list here means “not captured”.
          </p>
        ) : null}
      </header>

      {video ? <video class="video" src={video} controls autoPlay muted /> : null}

      <section class="section">
        <h2 class="section__title">Errors</h2>
        {errors.length === 0 ? (
          <p class="empty">Nothing was logged at error level.</p>
        ) : (
          <ul class="rows">
            {errors.map((entry, index) => (
              <ConsoleRow key={index} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">Network</h2>
        {network.length === 0 ? (
          <p class="empty">No requests recorded.</p>
        ) : (
          <ul class="rows">
            {network.map((entry, index) => (
              <NetworkRow key={index} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <footer class="foot">
        Everything else — steps, state, headers, bodies — is in{' '}
        <code>caliper trace {trace.files.trace}</code>.
      </footer>
    </main>
  );
};
