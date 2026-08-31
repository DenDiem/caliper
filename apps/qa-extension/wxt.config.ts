import {defineConfig} from 'wxt';
import {utf8SafeOutput} from './build/utf8-safe-output';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({plugins: [utf8SafeOutput()]}),
  zip: {name: 'caliper'},
  manifest: {
    name: 'Caliper QA — UI Marks & Bug Traces for AI Coding Agents',
    description:
      'Mark up any web UI or record a full bug trace — DOM, console, network and store — and hand a precise, replayable defect to Claude Code, Cursor or any AI agent.',
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab',
      'sidePanel',
      'scripting',
      'downloads',
      'offscreen',
      'tabCapture',
      // Required, not optional: Chrome silently ignores `debugger` in optional_permissions and then
      // refuses the request ("Only permissions specified in the manifest may be requested"), which would
      // leave response bodies, stack traces and the video fallback permanently unreachable. The
      // justification for asking up front is in docs/store-listing.md.
      'debugger',
      'webNavigation',
    ],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Toggle Caliper QA',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    side_panel: {default_path: 'sidepanel.html'},
    options_ui: {page: 'options.html', open_in_tab: true},
    commands: {
      'toggle-picker': {
        suggested_key: {default: 'Alt+Shift+C'},
        description: 'Switch the Caliper picker between Mark and Browse',
      },
      'open-panel': {
        suggested_key: {default: 'Alt+Shift+P'},
        description: 'Open the Caliper side panel',
      },
    },
  },
});
