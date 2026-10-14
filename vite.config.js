import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relativ base så att bygget fungerar både på GitHub Pages (/epatnor_game_tech/) och lokalt.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        island: resolve(import.meta.dirname, 'island/index.html'),
      },
    },
  },
});
