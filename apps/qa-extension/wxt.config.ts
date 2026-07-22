import {defineConfig} from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Caliper',
    description: 'Turn a clicked element into a machine-precise defect annotation.',
    permissions: ['storage', 'unlimitedStorage', 'activeTab', 'sidePanel', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {default_title: 'Toggle Caliper'},
    side_panel: {default_path: 'sidepanel.html'},
  },
});
