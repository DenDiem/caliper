import {defineConfig} from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {entry: 'client/main.tsx', formats: ['iife'], name: 'CaliperReview', fileName: () => 'client.js'},
    outDir: 'dist',
    emptyOutDir: false,
  },
});
