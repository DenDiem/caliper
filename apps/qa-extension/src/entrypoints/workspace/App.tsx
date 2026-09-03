import {useEffect, useState} from 'preact/hooks';
import {SessionView} from './SessionView';
import {TraceView} from './TraceView';

const TRACE = '#trace/';
const DEFECT = '#defect/';

interface Route {
  traceId: string | null;
  defectId: string | null;
}

const routeOf = (hash: string): Route => ({
  traceId: hash.startsWith(TRACE) ? hash.slice(TRACE.length) : null,
  defectId: hash.startsWith(DEFECT) ? hash.slice(DEFECT.length) : null,
});

export const App = () => {
  const [route, setRoute] = useState(() => routeOf(location.hash));

  useEffect(() => {
    const listener = () => setRoute(routeOf(location.hash));
    addEventListener('hashchange', listener);
    return () => removeEventListener('hashchange', listener);
  }, []);

  // Not history.back(): the tab is usually opened straight onto a trace from the panel, so there is
  // no earlier entry to go back to and the button did nothing at all. Going to the list is what the
  // button says it does, and it is right from either arrival.
  if (route.traceId !== null) {
    return <TraceView traceId={route.traceId} onBack={() => (location.hash = '#')} />;
  }

  return (
    <SessionView
      focusId={route.defectId}
      onOpenTrace={(id) => (location.hash = `${TRACE}${id}`)}
    />
  );
};
