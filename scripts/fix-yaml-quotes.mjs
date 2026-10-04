#!/usr/bin/env node
// Outil d'auteur : met entre guillemets les valeurs YAML simples du front matter
// qui contiennent « : » (sinon YAML les lit comme des clés imbriquées).
// Usage : node scripts/fix-yaml-quotes.mjs content/sc-500/lessons/*.md
import fs from 'node:fs';

for (const file of process.argv.slice(2)) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) continue;
  let changed = 0;
  const lines = m[1].split(/\r?\n/).map((line) => {
    // "  a: texte : suite" ou "  - texte : suite" ou "summary: texte : suite"
    const kv = line.match(/^(\s*(?:- )?[A-Za-z]+:\s)(.+)$/) ?? line.match(/^(\s*- )(.+)$/);
    if (!kv) return line;
    const [, head, value] = kv;
    if (/^["'|>]/.test(value) || !/: |\s#/.test(value)) return line;
    changed++;
    return `${head}"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  if (changed) {
    fs.writeFileSync(file, raw.replace(m[1], lines.join('\n')));
    console.log(`${file} : ${changed} valeur(s) mise(s) entre guillemets`);
  }
}
