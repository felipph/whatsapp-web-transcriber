import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'node:path';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        setup: resolve(__dirname, 'src/setup/setup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
    },
  },
  worker: {
    format: 'es',
  },
});
