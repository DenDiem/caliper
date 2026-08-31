import {useEffect, useState} from 'preact/hooks';
import type {CaliperTrace} from '@caliper/core';
import {getBlob} from '../../trace/blob-store';

const MS_PER_SECOND = 1000;

interface Props {
  trace: CaliperTrace;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}

export const TraceCard = ({trace, onRename, onRemove}: Props) => {
  const [video, setVideo] = useState<string | null>(null);
  const [label, setLabel] = useState(trace.label);

  useEffect(() => {
    void getBlob(`${trace.id}:video`).then((dataUrl) => setVideo(dataUrl ?? null));
  }, [trace.id]);

  const commit = (): void => {
    const next = label.trim();
    if (next && next !== trace.label) onRename(trace.id, next);
  };

  return (
    <li class="trace">
      <div class="trace__head">
        <span class="trace__badge">TRACE</span>
        <input
          class="trace__label"
          value={label}
          onInput={(event) => setLabel(event.currentTarget.value)}
          onBlur={commit}
          placeholder="What breaks here?"
        />
        <span class="trace__duration">{(trace.durationMs / MS_PER_SECOND).toFixed(1)}s</span>
        <button class="trace__remove" onClick={() => onRemove(trace.id)} aria-label="Delete trace">
          ✕
        </button>
      </div>

      {video ? <video class="trace__video" src={video} controls muted /> : null}

      <ul class="trace__chips">
        <li class="trace__chip">{trace.summary.steps} steps</li>
        <li class={trace.summary.consoleErrors > 0 ? 'trace__chip trace__chip--hot' : 'trace__chip'}>
          {trace.summary.consoleErrors} console
        </li>
        <li class={trace.summary.failedRequests > 0 ? 'trace__chip trace__chip--hot' : 'trace__chip'}>
          {trace.summary.failedRequests} failed
        </li>
        <li class="trace__chip">{trace.summary.stateActions} actions</li>
      </ul>

      {trace.sources.network === 'fallback' ? (
        <p class="trace__note">
          Network captured without the debugger — request and response bodies may be missing.
        </p>
      ) : null}

      {trace.files.video === undefined ? (
        <p class="trace__note">
          No video for this trace. Tab capture needs the panel to have been opened from the toolbar icon
          on this tab — Chrome revokes that after a navigation. The recorded trace itself is unaffected.
        </p>
      ) : null}

      {trace.truncated ? (
        <p class="trace__note">Recording hit its length limit — the earliest seconds were dropped.</p>
      ) : null}
    </li>
  );
};
