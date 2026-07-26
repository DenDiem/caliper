import {render} from 'preact';
import {App} from './App';
import './options.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
