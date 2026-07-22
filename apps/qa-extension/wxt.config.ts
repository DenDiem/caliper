import {defineConfig} from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Caliper',
    description: 'Turn a clicked element into a machine-precise defect annotation.',
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
    commands: {
      _execute_action: {
        suggested_key: {default: 'Alt+Shift+C'},
      },
      'toggle-picker': {
        suggested_key: {default: 'Alt+Shift+X'},
        description: 'Arm or disarm the Caliper picker',
      },
      'open-panel': {
        suggested_key: {default: 'Alt+Shift+P'},
        description: 'Open the Caliper side panel',
      },
    },
  },
});
