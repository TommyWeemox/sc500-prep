// Étude de cas finale et fiches de synthèse imprimables.
import { getCtx, store } from '../app';
import { data } from '../lib/data';
import { enhance, esc, formatDate } from '../lib/dom';
import type { Route } from '../lib/router';

export async function casesView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const list = ctx.catalog.caseStudies;
  if (list.length === 1) {
    location.replace(`#/etude-de-cas/${list[0].id}`);
    return;
  }
  main.innerHTML = `<h1 tabindex="-1">Études de cas</h1>${list.length ? `<ul class="plain">${list.map((c) => `<li class="card"><h2><a href="#/etude-de-cas/${c.id}">${esc(c.title)}</a></h2><p>${esc(c.summary)}</p></li>`).join('')}</ul>` : '<p>À venir.</p>'}`;
}

export async function caseView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  if (!ctx.catalog.caseStudies.some((c) => c.id === route.params.id)) {
    main.innerHTML = '<h1 tabindex="-1">Étude de cas introuvable</h1>';
    return;
  }
  const c = await data.caseStudy(ctx.cert, route.params.id);
  const notes = store.cert(ctx.cert).caseNotes[c.id] ?? '';
  main.innerHTML = `
    <h1 tabindex="-1">${esc(c.title)}</h1>
    <p class="lead">${esc(c.summary)}</p>
    <div class="prose">${c.statement}</div>
    <section class="card">
      <h2>Votre réponse</h2>
      <p>Rédigez votre architecture et vos décisions avant de lire le corrigé, section par section. Vos notes restent dans ce navigateur et sont incluses dans l'export.</p>
      <label for="case-notes" class="sr-only">Vos notes</label>
      <textarea id="case-notes" rows="16">${esc(notes)}</textarea>
      <p class="small muted" id="saved"></p>
      <button type="button" class="btn primary" data-act="answer">Afficher le corrigé argumenté</button>
    </section>
    <section class="prose answer" id="corrige" hidden>${c.answer}</section>
    <h2>Sources Microsoft Learn</h2>
    <ul class="sources">${c.sources.map((s) => `<li><a class="ext" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></li>`).join('')}</ul>`;
  await enhance(main);
  const ta = main.querySelector<HTMLTextAreaElement>('#case-notes')!;
  let t = 0;
  ta.addEventListener('input', () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      store.setCaseNotes(c.id, ta.value, ctx.cert);
      main.querySelector('#saved')!.textContent = 'Enregistré.';
    }, 400);
  });
  main.querySelector('[data-act="answer"]')!.addEventListener('click', async (e) => {
    if (ta.value.trim().length < 200 && !window.confirm("Vous avez peu écrit. Le corrigé est plus utile après avoir rédigé votre propre réponse. L'afficher quand même ?")) return;
    const sec = main.querySelector<HTMLElement>('#corrige')!;
    sec.hidden = false;
    (e.currentTarget as HTMLElement).remove();
    await enhance(sec);
    sec.scrollIntoView({ behavior: 'smooth' });
  });
}

export async function sheetsView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  main.innerHTML = `
    <h1 tabindex="-1">Fiches de synthèse</h1>
    <p class="lead">Une fiche par domaine, à imprimer ou à relire la dernière semaine. Elles résument, elles ne remplacent pas les leçons.</p>
    <ul class="grid cards-2 plain">${ctx.catalog.domains
      .map((d) => {
        const s = ctx.catalog.sheets.find((x) => x.domain === d.id);
        return `<li class="card"><h2>${s ? `<a href="#/fiches/${d.id}">${esc(d.titleFr)}</a>` : esc(d.titleFr)}</h2><p class="muted">${d.weight.min}-${d.weight.max} %${s ? '' : ' · à venir'}</p></li>`;
      })
      .join('')}</ul>`;
}

export async function sheetView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  if (!ctx.catalog.sheets.some((s) => s.domain === route.params.domain)) {
    main.innerHTML = '<h1 tabindex="-1">Fiche introuvable</h1><p><a href="#/fiches">Retour</a></p>';
    return;
  }
  const s = await data.sheet(ctx.cert, route.params.domain);
  main.innerHTML = `
    <nav class="crumbs no-print" aria-label="Fil d'Ariane"><a href="#/fiches">Fiches</a></nav>
    <div class="sheet">
      <h1 tabindex="-1">${esc(s.title)}</h1>
      <p class="meta">${esc(ctx.catalog.cert.code)} · vérifié sur Microsoft Learn le ${formatDate(s.verified)}</p>
      <p class="no-print"><button type="button" class="btn" data-act="print">Imprimer ou enregistrer en PDF</button></p>
      <div class="prose">${s.html}</div>
      <h2>Sources</h2>
      <ul class="sources">${s.sources.map((x) => `<li><a class="ext" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a></li>`).join('')}</ul>
    </div>`;
  await enhance(main);
  main.querySelector('[data-act="print"]')!.addEventListener('click', () => window.print());
}
