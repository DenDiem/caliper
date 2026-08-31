import {useEffect, useState} from 'preact/hooks';
import type {TraceStatusMessage} from '../../messaging/messages';

const POLL_MS = 1000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const IDLE: TraceStatusMessage = {
  type: 'caliper/trace-status',
  recording: false,
  startedAt: null,
  consoleErrors: 0,
  failedRequests: 0,
};

const elapsed = (startedAt: string | null, now: number): string => {
  if (!startedAt) return '0:00';
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / MS_PER_SECOND));
  return `${Math.floor(total / SECONDS_PER_MINUTE)}:${String(total % SECONDS_PER_MINUTE).padStart(2, '0')}`;
};

const isStatus = (value: unknown): value is TraceStatusMessage =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'recording') === 'boolean';

export const RecordBar = () => {
  const [status, setStatus] = useState<TraceStatusMessage>(IDLE);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const poll = window.setInterval(() => {
      setNow(Date.now());
      void chrome.runtime
        .sendMessage({type: 'caliper/trace-status'})
        .then((next: unknown) => {
          if (isStatus(next)) setStatus(next);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  // The label defaults to the page title and is edited on the finished card. Asking for it up front
  // would demand a description of a defect the tester has not reproduced yet.
  const start = async (): Promise<void> => {
    setBusy(true);
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (typeof tab?.id === 'number') {
        const started: unknown = await chrome.runtime.sendMessage({
          type: 'caliper/trace-start',
          tabId: tab.id,
          label: tab.title ?? 'Bug trace',
        });
        // A refused start (a recording already running elsewhere) used to look like a dead button.
        setRefused(started !== true);
      }
    } finally {
      // Always cleared: a start that failed anywhere used to leave the button disabled with no way back.
      setBusy(false);
    }
  };

  // No tab id: the background stops whichever trace is running, so Stop works even from a panel that
  // is looking somewhere else. The status is left to the poll rather than assumed.
  const stop = async (): Promise<void> => {
    setBusy(true);
    const stopped: unknown = await chrome.runtime
      .sendMessage({type: 'caliper/trace-stop'})
      .catch(() => false);
    if (stopped === true) setStatus(IDLE);
    setBusy(false);
  };

  if (!status.recording) {
    return (
      <button class="record" onClick={() => void start()} disabled={busy}>
        <span class="record__dot" />
        {refused ? 'ALREADY RECORDING ELSEWHERE' : 'START TRACE'}
      </button>
    );
  }

  return (
    <div class="record record--live">
      <button class="record__stop" onClick={() => void stop()} disabled={busy}>
        <span class="record__square" />
        STOP
      </button>
      <span class="record__timer">{elapsed(status.startedAt, now)}</span>
      <span class="record__counts">
        <span class={status.consoleErrors > 0 ? 'record__count record__count--hot' : 'record__count'}>
          {status.consoleErrors} err
        </span>
        <span class={status.failedRequests > 0 ? 'record__count record__count--hot' : 'record__count'}>
          {status.failedRequests} net
        </span>
      </span>
    </div>
  );
};
