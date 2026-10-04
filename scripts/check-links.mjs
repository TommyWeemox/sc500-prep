#!/usr/bin/env node
// Vérifie que chaque URL citée dans le contenu répond (HTTP 200 après redirection).
// Les redirections sont signalées pour mettre à jour l'URL canonique.
import { listCerts, loadCert, collectUrls } from './lib/content.mjs';

const CONCURRENCY = 8;
const urls = new Map();
for (const id of listCerts()) {
  for (const [u, where] of collectUrls(loadCert(id))) {
    if (!urls.has(u)) urls.set(u, new Set());
    for (const w of where) urls.get(u).add(w);
  }
}

async function check(url, attempt = 1) {
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'sc500-prep-link-check' } });
    const final = res.url.split('?')[0].split('#')[0];
    const original = url.split('?')[0];
    return { url, status: res.status, redirected: final !== original ? final : null };
  } catch (e) {
    if (attempt < 3) return check(url, attempt + 1);
    return { url, status: 0, error: e.message };
  }
}

const list = [...urls.keys()];
const results = [];
let i = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < list.length) results.push(await check(list[i++]));
}));

const broken = results.filter((r) => r.status !== 200);
const redirected = results.filter((r) => r.status === 200 && r.redirected);
for (const r of redirected) console.warn(`REDIRECTION ${r.url}\n  -> ${r.redirected}\n  (${[...urls.get(r.url)].join(', ')})`);
for (const r of broken) console.error(`CASSÉ ${r.status || r.error} ${r.url}\n  (${[...urls.get(r.url)].join(', ')})`);
console.log(`\n${results.length} URL vérifiées : ${broken.length} cassée(s), ${redirected.length} redirection(s).`);
process.exit(broken.length ? 1 : 0);
