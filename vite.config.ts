/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildAll, OUT_DIR } from './scripts/lib/build.mjs';

/** Compile content/ en public/data/ au démarrage et à chaque modification en dev. */
function contentPlugin(): Plugin {
  let isDev = false;
  return {
    name: 'sc500-content',
    configResolved(config) {
      isDev = config.command === 'serve';
    },
    buildStart() {
      try {
        buildAll();
      } catch (e) {
        // En dev, une erreur de contenu ne doit pas arrêter le serveur ; au build, elle doit échouer.
        if (!isDev) throw e;
        console.error(`Contenu invalide : ${(e as Error).message}`);
      }
    },
    configureServer(server) {
      // Sert public/data directement : l'index des fichiers publics de Vite ne suit pas
      // la suppression puis recréation du dossier à chaque recompilation du contenu.
      server.middlewares.use('/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(OUT_DIR, rel);
        if (!file.startsWith(path.resolve(OUT_DIR)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      });
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
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
