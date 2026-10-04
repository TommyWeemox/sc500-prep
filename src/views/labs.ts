// Labs : liste par domaine et page de lab.
import { getCtx, objectiveLabel, store } from '../app';
import { data } from '../lib/data';
import { enhance, esc, formatDate } from '../lib/dom';
import type { Route } from '../lib/router';
import type { LabMeta } from '../lib/types';

const WARNING = `<aside class="callout callout-warn" role="note"><p class="callout-title">Abonnement personnel ou tenant de test uniquement</p>
<p>Ne lancez jamais ces labs dans un environnement d'entreprise. Utilisez un abonnement Azure personnel (essai gratuit ou pay-as-you-go) et un tenant Microsoft Entra de test. Les commandes créent, modifient et suppriment des ressources et des rôles. Faites toujours le nettoyage à la fin pour éviter les coûts.</p></aside>`;

function labCard(l: LabMeta, done: boolean): string {
  return `<li class="card lab-card ${l.thread ? 'thread' : ''}">
    <h3><a href="#/labs/${l.id}">${esc(l.title)}</a></h3>
    <p>${esc(l.summary)}</p>
    <p class="muted small">${esc(l.duration)} · ${esc(l.cost)} · ${esc(l.level)}${done ? ' · <span class="tag tag-ok">Fait</span>' : ''}</p>
  </li>`;
}

export async function labsView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const cs = store.cert(ctx.cert);
  const thread = ctx.catalog.labs.filter((l) => l.thread);
  main.innerHTML = `
    <h1 tabindex="-1">Labs</h1>
    <p class="lead">Les compétences s'acquièrent en faisant. Chaque lab donne l'objectif, le coût estimé, des étapes avec commandes, une vérification, un défi « casse puis répare » et un nettoyage obligatoire.</p>
    ${WARNING}
    ${thread.length ? `<section><h2>Lab fil rouge : accès privilégié Just-in-Time</h2><ul class="grid cards-2 plain">${thread.map((l) => labCard(l, Boolean(cs.labs[l.id]))).join('')}</ul></section>` : ''}
    ${ctx.catalog.domains
      .map((d) => {
        const labs = ctx.catalog.labs.filter((l) => !l.thread && l.domain === d.id);
        return `<section><h2>${esc(d.titleFr)}</h2>${labs.length ? `<ul class="grid cards-2 plain">${labs.map((l) => labCard(l, Boolean(cs.labs[l.id]))).join('')}</ul>` : '<p class="muted">Labs à venir.</p>'}</section>`;
      })
      .join('')}`;
}

export async function labView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const meta = ctx.catalog.labs.find((l) => l.id === route.params.id);
  if (!meta) {
    main.innerHTML = '<h1 tabindex="-1">Lab introuvable</h1><p><a href="#/labs">Retour aux labs</a></p>';
    return;
  }
  const lab = await data.lab(ctx.cert, meta.id);
  const done = store.cert(ctx.cert).labs[lab.id];
  main.innerHTML = `
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="#/labs">Labs</a></nav>
    <h1 tabindex="-1">${esc(lab.title)}</h1>
    <p class="meta">${esc(lab.duration)} · ${esc(lab.cost)} · ${esc(lab.level)}</p>
    <p class="small">Objectifs : ${lab.objectives.map((o) => `<a href="#/cours/${o}">${esc(objectiveLabel(ctx, o))}</a>`).join(', ')}</p>
    ${WARNING}
    <div class="lesson-layout">
      <aside class="toc" aria-label="Sommaire du lab"><p class="toc-title">Sommaire</p><ol>${lab.toc.map((h) => `<li><a href="#/labs/${lab.id}#${h.id}">${esc(h.text)}</a></li>`).join('')}</ol></aside>
      <div class="prose">${lab.html}</div>
    </div>
    <p><button type="button" class="btn ${done ? '' : 'primary'}" data-act="done">${done ? `Fait le ${formatDate(done.doneAt)} (annuler)` : 'Marquer comme fait (nettoyage compris)'}</button></p>
    <h2>Sources Microsoft Learn</h2>
    <ul class="sources">${lab.sources.map((s) => `<li><a class="ext" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul>`;
  await enhance(main);
  main.querySelector('[data-act="done"]')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const isDone = Boolean(store.cert(ctx.cert).labs[lab.id]);
    store.setLabDone(lab.id, !isDone, ctx.cert);
    const now = store.cert(ctx.cert).labs[lab.id];
    btn.textContent = now ? `Fait le ${formatDate(now.doneAt)} (annuler)` : 'Marquer comme fait (nettoyage compris)';
    btn.classList.toggle('primary', !now);
  });
}
