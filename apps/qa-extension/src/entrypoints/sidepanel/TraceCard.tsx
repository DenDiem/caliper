import {useEffect, useState} from 'preact/hooks';
import type {CaliperTrace} from '@caliper/core';
import {truncationNote} from '@caliper/core';
import {getBlob} from '../../trace/blob-store';

const MS_PER_SECOND = 1000;

interface Props {
  trace: CaliperTrace;
  index: number;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}

// Two recordings of the same page carry the same label, so without a number the only thing telling
// them apart in the panel is their duration.
const ordinal = (index: number): string => String(index + 1).padStart(2, '0');

// The Fullscreen API is unavailable in a side panel, so the video's own fullscreen button does
// nothing there. The detail page is an ordinary extension tab, where it works -- and where there is
// room for the console and network read-out the panel has no space for.
const openDetail = (traceId: string): void => {
  void chrome.tabs.create({url: chrome.runtime.getURL(`trace.html#${traceId}`)});
};

export const TraceCard = ({trace, index, onRename, onRemove}: Props) => {
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
        <span class="trace__index">{ordinal(index)}</span>
        <input
          class="trace__label"
          value={label}
          onInput={(event) => setLabel(event.currentTarget.value)}
          onBlur={commit}
          placeholder="What breaks here?"
        />
        <span class="trace__duration">{(trace.durationMs / MS_PER_SECOND).toFixed(1)}s</span>
        <button
          class="trace__open"
          onClick={() => openDetail(trace.id)}
          title="Open this trace — video, console and network"
          aria-label="Open this trace"
        >
          ⤢
        </button>
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
          on this tab (Chrome revokes that after a navigation), and the debugger screencast that would
          otherwise stand in was unavailable too. The recorded trace itself is unaffected.
        </p>
      ) : null}

      {trace.truncated ? <p class="trace__note">{truncationNote(trace)}</p> : null}
    </li>
  );
};
