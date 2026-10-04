// Recherche plein texte (MiniSearch) sur leçons, questions, flashcards, labs, fiches et étude de cas.
import MiniSearch from 'minisearch';
import { store } from '../app';
import { data } from '../lib/data';
import { esc } from '../lib/dom';
import type { Route } from '../lib/router';
import type { SearchDoc } from '../lib/types';

const indexes = new Map<string, Promise<{ ms: MiniSearch<SearchDoc>; docs: Map<string, SearchDoc> }>>();

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function buildIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const ms = new MiniSearch<SearchDoc>({
    fields: ['title', 'text'],
    storeFields: ['id'],
    processTerm: (t) => normalize(t),
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
  ms.addAll(docs);
  return ms;
}

function getIndex(cert: string) {
  if (!indexes.has(cert)) {
    indexes.set(cert, data.search(cert).then((docs) => ({ ms: buildIndex(docs), docs: new Map(docs.map((d) => [d.id, d])) })));
  }
  return indexes.get(cert)!;
}

function snippet(text: string, terms: string[]): string {
  const n = normalize(text);
  let pos = -1;
  for (const t of terms) {
    pos = n.indexOf(t);
    if (pos >= 0) break;
  }
  const start = Math.max(0, pos - 80);
  let s = text.slice(start, start + 220);
  if (start > 0) s = `…${s}`;
  if (start + 220 < text.length) s += '…';
  let out = esc(s);
  for (const t of terms.filter((x) => x.length > 2)) {
    out = out.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>');
  }
  return out;
}

export async function searchView(route: Route, main: HTMLElement): Promise<void> {
  const q = route.query.get('q') ?? '';
  main.innerHTML = `
    <h1 tabindex="-1">Recherche</h1>
    <form role="search" class="search-page"><label for="sq" class="sr-only">Rechercher</label><input id="sq" type="search" name="q" value="${esc(q)}" placeholder="Ex. : PIM approbation, private endpoint DNS, JIT" autocomplete="off"><button class="btn primary">Rechercher</button></form>
    <div id="results" aria-live="polite"></div>`;
  const input = main.querySelector<HTMLInputElement>('#sq')!;
  const out = main.querySelector<HTMLElement>('#results')!;
  main.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = `#/recherche?q=${encodeURIComponent(input.value)}`;
  });
  if (!q.trim()) {
    input.focus();
    return;
  }
  out.innerHTML = '<p class="muted">Recherche…</p>';
  const { ms, docs } = await getIndex(store.state.prefs.cert);
  let hits = ms.search(q);
  if (!hits.length) hits = ms.search(q, { combineWith: 'OR' });
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  const groups = new Map<string, SearchDoc[]>();
  for (const h of hits.slice(0, 80)) {
    const d = docs.get(h.id as string)!;
    if (!groups.has(d.kind)) groups.set(d.kind, []);
    groups.get(d.kind)!.push(d);
  }
  out.innerHTML = hits.length
    ? `<p>${hits.length} résultat(s).</p>${[...groups]
        .map(([kind, list]) => `<section><h2>${esc(kind)} (${list.length})</h2><ul class="results">${list.map((d) => `<li><a href="${esc(d.route)}">${esc(d.title)}</a><p class="small">${snippet(d.text, terms)}</p></li>`).join('')}</ul></section>`)
        .join('')}`
    : '<p>Aucun résultat. Essayez un terme anglais officiel (ex. « Conditional Access ») ou plus court.</p>';
}
