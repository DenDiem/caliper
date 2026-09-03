import {useEffect, useState} from 'preact/hooks';
import {SessionView} from './SessionView';
import {TraceView} from './TraceView';

const TRACE_ROUTE = '#trace/';

const routeOf = (hash: string): string | null =>
  hash.startsWith(TRACE_ROUTE) ? hash.slice(TRACE_ROUTE.length) : null;

// The hash is the route so the browser's own back button works, which is what a person reaches for
// after following a trace out of the list.
export const App = () => {
  const [traceId, setTraceId] = useState(() => routeOf(location.hash));

  useEffect(() => {
    const listener = () => setTraceId(routeOf(location.hash));
    addEventListener('hashchange', listener);
    return () => removeEventListener('hashchange', listener);
  }, []);

  if (traceId !== null) {
    return <TraceView traceId={traceId} onBack={() => history.back()} />;
  }
  return <SessionView onOpenTrace={(id) => (location.hash = `${TRACE_ROUTE}${id}`)} />;
};
