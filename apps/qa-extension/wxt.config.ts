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
    action: {default_title: 'Toggle Caliper'},
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
