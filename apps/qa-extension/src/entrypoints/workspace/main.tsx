import '@caliper/design/tokens.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import {render} from 'preact';
import {App} from './App';
import '../sidepanel/sidepanel.css';
import './workspace.css';

const root = document.getElementById('root');
if (root) render(<App />, root);
