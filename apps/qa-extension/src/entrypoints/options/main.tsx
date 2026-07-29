import '@caliper/design/tokens.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import {render} from 'preact';
import {seedDevJira} from '../../jira/jira-dev';
import {App} from './App';
import './options.css';

if (import.meta.env.DEV) void seedDevJira();

const root = document.getElementById('app');
if (root) render(<App />, root);
