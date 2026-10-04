/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { buildAll } from './scripts/lib/build.mjs';

/** Compile content/ en public/data/ au démarrage et à chaque modification en dev. */
function contentPlugin(): Plugin {
  return {
    name: 'sc500-content',
    buildStart() {
      buildAll();
    },
    configureServer(server) {
      server.watcher.add('content');
      server.watcher.on('all', (_event, file) => {
        if (!/[\\/]content[\\/]/.test(file)) return;
        try {
          buildAll();
          server.ws.send({ type: 'full-reload' });
        } catch (e) {
          server.config.logger.error(`Contenu invalide : ${(e as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le site fonctionne sous /sc500-prep/ (GitHub Pages) comme en local.
  base: './',
  plugins: [contentPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
