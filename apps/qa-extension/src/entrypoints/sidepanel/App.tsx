import type {CaliperSession} from '@caliper/core';
import {toToon} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {copyToClipboard, downloadJson, exportSession} from '../../export/export-session';
import {chromeStorageSink} from '../../sinks/chrome-storage.sink';

export const App = () => {
  const [session, setSession] = useState<CaliperSession | null>(null);

  const refresh = () => {
    void chromeStorageSink.read().then(setSession);
  };

  useEffect(() => {
    refresh();
    const listener = () => refresh();
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  if (!session) return <p class="empty">Loading…</p>;

  if (session.annotations.length === 0) {
    return <p class="empty">No defects yet. Click the toolbar icon, then click an element.</p>;
  }

  return (
    <div class="panel">
      <header class="panel__header">
        <strong>{session.annotations.length} defects</strong>
        <div class="panel__actions">
          <button onClick={() => void copyToClipboard(toToon(session))}>Copy TOON</button>
          <button onClick={() => void copyToClipboard(exportSession(session, {withAssets: false}))}>
            Copy JSON
          </button>
          <button
            onClick={() =>
              downloadJson(exportSession(session, {withAssets: true}), `caliper-${session.id}.json`)
            }
          >
            Download
          </button>
          <button onClick={() => void chromeStorageSink.clear().then(refresh)}>Clear</button>
        </div>
      </header>

      <ul class="list">
        {session.annotations.map((annotation) => (
          <li key={annotation.id} class="item">
            <div class={`item__severity item__severity--${annotation.severity}`}>
              {annotation.severity}
            </div>
            <div class="item__component">
              {annotation.target.componentName ?? annotation.target.tagName}
            </div>
            <p class="item__comment">{annotation.comment}</p>
            <code class="item__selector">{annotation.target.selector}</code>
            {annotation.screenshotId && session.assets[annotation.screenshotId] ? (
              <img class="item__shot" src={session.assets[annotation.screenshotId]} alt="" />
            ) : null}
            <button
              class="item__remove"
              onClick={() => void chromeStorageSink.remove(annotation.id).then(refresh)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
