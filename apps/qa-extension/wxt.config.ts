import {defineConfig} from 'wxt';

export default defineConfig({
  srcDir: 'src',
  zip: {name: 'caliper'},
  manifest: {
    name: 'Caliper — Design Mode & UI Annotation for AI Coding Agents',
    description:
      'Mark up any web UI — click, strike, or lasso an element — and hand a precise defect to Claude Code, Cursor or any AI agent.',
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab',
      'sidePanel',
      'scripting',
      'downloads',
    ],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'Toggle Caliper',
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
