// Flashcards avec répétition espacée (SM-2) et marquage « difficile ».
import { getCards, getCtx, objectiveLabel, store } from '../app';
import { announce, enhance, esc } from '../lib/dom';
import { shuffle } from '../lib/quiz';
import type { Route } from '../lib/router';
import { GRADES, isDue, nextLabel, type Grade } from '../lib/srs';
import type { Flashcard } from '../lib/types';

type Filter = { objective?: string; domain?: string; hard?: boolean; card?: string; ahead?: boolean };

export function selectCards(all: Flashcard[], f: Filter, domainOf: (obj: string) => string | undefined, certId: string, today: string): { queue: Flashcard[]; dueCount: number; newCount: number } {
  const cs = store.cert(certId);
  let pool = all;
  if (f.card) return { queue: all.filter((c) => c.id === f.card), dueCount: 0, newCount: 0 };
  if (f.objective) pool = pool.filter((c) => c.objective === f.objective);
  if (f.domain) pool = pool.filter((c) => domainOf(c.objective) === f.domain);
  if (f.hard) pool = pool.filter((c) => cs.cards[c.id]?.hard);
  const due = pool.filter((c) => cs.cards[c.id] && isDue(cs.cards[c.id].srs, today));
  // Nouvelles cartes : limite quotidienne, comptée sur les cartes vues pour la première fois aujourd'hui.
  const introducedToday = Object.values(cs.cards).filter((c) => c.seen === 1 && c.srs.last === today).length;
  const newLimit = f.objective || f.hard ? Infinity : Math.max(0, cs.settings.newCardsPerDay - introducedToday);
  const fresh = pool.filter((c) => !cs.cards[c.id]).slice(0, newLimit);
  let queue = [...shuffle(due), ...fresh];
  if (!queue.length && f.ahead) queue = shuffle(pool).slice(0, 20);
  return { queue, dueCount: due.length, newCount: fresh.length };
}

export async function flashcardsView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const all = await getCards();
  const today = store.today();
  const f: Filter = {
    objective: route.query.get('objective') ?? undefined,
    domain: route.query.get('domain') ?? undefined,
    hard: route.query.get('hard') === '1',
    card: route.query.get('card') ?? undefined,
    ahead: route.query.get('ahead') === '1',
  };
  const domainOf = (o: string) => ctx.domainOf.get(o)?.id;
  const { queue, dueCount, newCount } = selectCards(all, f, domainOf, ctx.cert, today);
  const cs = store.cert(ctx.cert);
  const hardCount = Object.values(cs.cards).filter((c) => c.hard).length;

  const filterForm = `
    <form class="filters" id="filters">
      <label>Objectif <select name="objective"><option value="">Tous</option>${ctx.catalog.domains.flatMap((d) => d.objectives).map((o) => `<option value="${o.id}" ${f.objective === o.id ? 'selected' : ''}>${esc(o.id)} · ${esc(o.titleFr)}</option>`).join('')}</select></label>
      <label>Domaine <select name="domain"><option value="">Tous</option>${ctx.catalog.domains.map((d) => `<option value="${d.id}" ${f.domain === d.id ? 'selected' : ''}>${esc(d.titleFr)}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="hard" value="1" ${f.hard ? 'checked' : ''}> Seulement les cartes difficiles (${hardCount})</label>
      <button class="btn small">Filtrer</button>
    </form>`;

  if (!queue.length) {
    main.innerHTML = `<h1 tabindex="-1">Flashcards</h1>${filterForm}
      <div class="empty"><p>Rien à réviser pour ce filtre aujourd'hui. La répétition espacée vous reproposera les cartes au bon moment.</p>
      <p><a class="btn" href="#/flashcards?${new URLSearchParams({ ...(f.objective ? { objective: f.objective } : {}), ...(f.domain ? { domain: f.domain } : {}), ahead: '1' })}">Réviser quand même 20 cartes en avance</a></p></div>`;
    bindFilters(main);
    return;
  }

  let i = 0;
  let flipped = false;
  let reviewed = 0;
  main.innerHTML = `
    <h1 tabindex="-1">Flashcards</h1>
    ${filterForm}
    <p class="muted">${dueCount} carte(s) à revoir, ${newCount} nouvelle(s). Raccourcis : Espace pour retourner, 1 à 4 pour noter, D pour marquer difficile.</p>
    <div class="fc-wrap">
      <div class="fc" aria-live="polite"></div>
      <div class="fc-actions"></div>
    </div>`;
  bindFilters(main);
  const card = main.querySelector<HTMLElement>('.fc')!;
  const actions = main.querySelector<HTMLElement>('.fc-actions')!;

  const draw = () => {
    const c = queue[i];
    const st = store.cert(ctx.cert).cards[c.id];
    card.innerHTML = `
      <p class="fc-meta"><span class="tag">${esc(objectiveLabel(ctx, c.objective))}</span> ${st?.hard ? '<span class="tag tag-warn">Difficile</span>' : ''} <span class="muted small">${i + 1} / ${queue.length}</span></p>
      <div class="fc-front">${c.front}</div>
      <div class="fc-back prose" ${flipped ? '' : 'hidden'}>${c.back}${c.source ? `<p class="small"><a class="ext" href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">Source Microsoft Learn</a></p>` : ''}</div>`;
    if (flipped) void enhance(card);
    actions.innerHTML = flipped
      ? `<div class="grade-btns" role="group" aria-label="Évaluer votre rappel">
          <button type="button" class="btn grade-again" data-grade="again">1 · À revoir</button>
          <button type="button" class="btn grade-hard" data-grade="hard">2 · Difficile</button>
          <button type="button" class="btn grade-good" data-grade="good">3 · Bien</button>
          <button type="button" class="btn grade-easy" data-grade="easy">4 · Facile</button>
        </div>
        <button type="button" class="btn small" data-act="hard" aria-pressed="${Boolean(st?.hard)}">${st?.hard ? 'Retirer « difficile »' : 'Marquer difficile'} (D)</button>`
      : `<button type="button" class="btn primary" data-act="flip">Afficher la réponse (Espace)</button>`;
    (actions.querySelector('button') as HTMLElement | null)?.focus();
  };

  const grade = (g: keyof typeof GRADES) => {
    const c = queue[i];
    const res = store.gradeCard(c.id, GRADES[g] as Grade, ctx.cert);
    reviewed++;
    // « À revoir » : la carte revient en fin de session.
    if (g === 'again') queue.push(c);
    announce(`Prochaine révision ${nextLabel(res.srs, today)}`);
    i++;
    flipped = false;
    if (i >= queue.length) return done();
    draw();
  };

  const done = () => {
    document.removeEventListener('keydown', onKey);
    card.innerHTML = `<h2>Session terminée</h2><p>${reviewed} révision(s). Les cartes reviendront selon votre notation : plus une carte est facile, plus l'intervalle s'allonge.</p>`;
    actions.innerHTML = `<a class="btn primary" href="#/">Tableau de bord</a> <a class="btn" href="#/quiz">Faire un quiz</a>`;
  };

  actions.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.act === 'flip') { flipped = true; draw(); }
    if (b.dataset.act === 'hard') { store.toggleHard(queue[i].id, ctx.cert); draw(); }
    if (b.dataset.grade) grade(b.dataset.grade as keyof typeof GRADES);
  });
  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(card)) return document.removeEventListener('keydown', onKey);
    if ((e.target as HTMLElement).matches('input, select, textarea')) return;
    if (e.key === ' ' && !flipped) { e.preventDefault(); flipped = true; draw(); return; }
    if (e.key.toLowerCase() === 'd' && flipped) { store.toggleHard(queue[i].id, ctx.cert); draw(); return; }
    const map: Record<string, keyof typeof GRADES> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
    if (flipped && map[e.key]) { e.preventDefault(); grade(map[e.key]); }
  };
  document.addEventListener('keydown', onKey);
  draw();
}

function bindFilters(main: HTMLElement): void {
  main.querySelector<HTMLFormElement>('#filters')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (v) p.set(k, String(v));
    location.hash = `#/flashcards?${p}`;
  });
}
