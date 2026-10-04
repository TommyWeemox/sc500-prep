#!/usr/bin/env node
// Génère TO_VERIFY.md : toutes les occurrences de "(à vérifier)" dans le contenu.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTENT_DIR } from './lib/content.mjs';

const MARK = '(à vérifier)';
const hits = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|json)$/.test(e.name)) {
      fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, n) => {
        if (line.includes(MARK)) {
          const idx = line.indexOf(MARK);
          const ctx = line.slice(Math.max(0, idx - 160), idx + MARK.length).replace(/^\s+/, '').replace(/\|/g, '\\|');
          hits.push({ file: path.relative(ROOT, p).replace(/\\/g, '/'), line: n + 1, ctx });
        }
      });
    }
  }
}
walk(CONTENT_DIR);

const lines = [
  '# Points à vérifier',
  '',
  'Fichier généré par `npm run to-verify`. Ne pas éditer à la main.',
  '',
  'Chaque ligne correspond à une affirmation que Microsoft Learn ne permettait pas de confirmer au moment de la rédaction (page absente, ambiguë, ou fonctionnalité en préversion qui évolue). Le site les affiche surlignées. Pour en traiter une : vérifier sur Microsoft Learn, corriger le texte, retirer la mention, relancer le script.',
  '',
];
if (!hits.length) lines.push('Aucun point en attente.');
else {
  lines.push(`${hits.length} point(s) en attente.`, '', '| Fichier | Ligne | Contexte |', '| --- | --- | --- |');
  for (const h of hits) lines.push(`| \`${h.file}\` | ${h.line} | …${h.ctx} |`);
}
fs.writeFileSync(path.join(ROOT, 'TO_VERIFY.md'), lines.join('\n') + '\n');
console.log(`TO_VERIFY.md : ${hits.length} point(s).`);
