import { defineConfig } from 'vite';

// Relativ base så att bygget fungerar både på GitHub Pages (/epatnor_game_tech/) och lokalt.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
});
