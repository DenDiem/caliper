import type {CaliperSession} from '@caliper/core';
import {toToon} from '@caliper/core';
import {useEffect, useState} from 'preact/hooks';
import {copyToClipboard, downloadSessionBundle, exportSession} from '../../export/export-session';
import {chromeStorageSink} from '../../sinks/chrome-storage.sink';
import {Controls} from './Controls';

const index = (position: number): string => String(position + 1).padStart(2, '0');

export const App = () => {
  const [session, setSession] = useState<CaliperSession | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = () => {
    void chromeStorageSink.read().then(setSession);
  };

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

  if (!session) return <div class="panel" />;

  const {annotations} = session;

  return (
    <div class="panel">
      <header class="head">
        <div class="head__count">
          <span class="head__number">{String(annotations.length).padStart(2, '0')}</span>
          <span class="head__unit">
            defect{annotations.length === 1 ? '' : 's'}
          </span>
        </div>

        <div class="head__actions">
          <button
            class="btn"
            disabled={annotations.length === 0}
            onClick={() => copy('toon', toToon(session))}
          >
            {copied === 'toon' ? 'copied' : 'TOON'}
          </button>
          <button
            class="btn"
            disabled={annotations.length === 0}
            onClick={() => copy('json', exportSession(session, {withAssets: false}))}
          >
            {copied === 'json' ? 'copied' : 'JSON'}
          </button>
          <button
            class="btn"
            disabled={annotations.length === 0}
            onClick={() => void downloadSessionBundle(session)}
          >
            save
          </button>
          <button
            class="btn btn--danger"
            disabled={annotations.length === 0}
            onClick={() => void chromeStorageSink.clear().then(refresh)}
          >
            clear
          </button>
        </div>
      </header>

      {annotations.length === 0 ? (
        <div class="blank">
          <p class="blank__title">No measurements yet</p>
          <p class="blank__hint">
            Arm the picker, then click any element on the page to record what is wrong with it.
          </p>
        </div>
      ) : (
        <ul class="list">
          {annotations.map((annotation, position) => (
            <li
              key={annotation.id}
              class={`row row--${annotation.severity}`}
              style={{animationDelay: `${Math.min(position, 8) * 40}ms`}}
            >
              <div class="row__top">
                <span class="row__index">{index(position)}</span>
                <span class="row__severity">{annotation.severity}</span>
                <span class="row__component">
                  {annotation.target.componentName ?? annotation.target.tagName}
                </span>
                <button
                  class="row__remove"
                  title="Remove"
                  onClick={() => void chromeStorageSink.remove(annotation.id).then(refresh)}
                >
                  ×
                </button>
              </div>

              <p class="row__comment">{annotation.comment}</p>

              <code class="row__selector">{annotation.target.selector}</code>

              {annotation.target.selectorConfidence === 'low' ? (
                <span class="row__warn">brittle selector</span>
              ) : null}

              {annotation.screenshotId && session.assets[annotation.screenshotId] ? (
                <img class="row__shot" src={session.assets[annotation.screenshotId]} alt="" />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Controls />
    </div>
  );
};
