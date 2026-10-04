// Journal d'erreurs automatique : chaque réponse fausse y entre, deux bonnes réponses d'affilée l'en sortent.
import { getCtx, getQuestions, objectiveLabel, store } from '../app';
import { esc, formatDate, stripTags } from '../lib/dom';
import type { Route } from '../lib/router';
import { nextLabel } from '../lib/srs';

export async function journalView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const qs = await getQuestions();
  const byId = new Map(qs.map((q) => [q.id, q]));
  const cs = store.cert(ctx.cert);
  const show = route.query.get('show') ?? 'active';
  const all = Object.values(cs.mistakes).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  const list = all.filter((m) => (show === 'all' ? true : show === 'resolved' ? m.resolved : !m.resolved));
  const today = store.today();

  // Répartition des erreurs actives par objectif.
  const perObj = new Map<string, number>();
  for (const m of all.filter((x) => !x.resolved)) perObj.set(m.objective, (perObj.get(m.objective) ?? 0) + 1);
  const ranking = [...perObj].sort((a, b) => b[1] - a[1]);

  const letter = (qid: string, oid: string) => {
    const q = byId.get(qid);
    const i = q?.options.findIndex((o) => o.id === oid) ?? -1;
    return i >= 0 ? 'ABCDEFGHIJ'[i] : oid;
  };

  main.innerHTML = `
    <h1 tabindex="-1">Journal d'erreurs</h1>
    <p class="lead">Rempli automatiquement. Une question ratée revient selon la répétition espacée et sort du journal après deux bonnes réponses d'affilée.</p>
    <nav class="tabs" aria-label="Filtre">
      <a href="#/journal?show=active" ${show === 'active' ? 'aria-current="page"' : ''}>Actives (${all.filter((m) => !m.resolved).length})</a>
      <a href="#/journal?show=resolved" ${show === 'resolved' ? 'aria-current="page"' : ''}>Résolues (${all.filter((m) => m.resolved).length})</a>
      <a href="#/journal?show=all" ${show === 'all' ? 'aria-current="page"' : ''}>Toutes (${all.length})</a>
    </nav>
    ${ranking.length ? `<p>Erreurs actives par objectif : ${ranking.map(([o, n]) => `<a href="#/cours/${o}">${esc(o)}</a> (${n})`).join(', ')}.</p>
      <p><a class="btn primary" href="#/quiz/run?mode=mistakes&count=20">Rejouer mes erreurs</a></p>` : ''}
    ${list.length ? `<div class="table-wrap" tabindex="0"><table class="journal">
      <thead><tr><th scope="col">Question</th><th scope="col">Objectif</th><th scope="col">Erreurs</th><th scope="col">Dernière</th><th scope="col">Votre dernier choix</th><th scope="col">Prochaine révision</th><th scope="col"></th></tr></thead>
      <tbody>${list
        .map((m) => {
          const q = byId.get(m.qid);
          const srs = cs.questions[m.qid]?.srs;
          const stem = q ? stripTags(q.stem) : m.qid;
          return `<tr>
            <td>${esc(stem.length > 140 ? `${stem.slice(0, 140)}…` : stem)}</td>
            <td><a href="#/cours/${m.objective}">${esc(objectiveLabel(ctx, m.objective))}</a></td>
            <td>${m.count}</td>
            <td>${formatDate(m.lastAt)}</td>
            <td>${esc(m.lastSelection.map((o) => letter(m.qid, o)).join(q?.type === 'order' ? ' → ' : ', ') || 'aucune')}</td>
            <td>${m.resolved ? 'résolue' : srs ? nextLabel(srs, today) : ''}</td>
            <td><a href="#/quiz/run?mode=question&id=${encodeURIComponent(m.qid)}">Refaire</a></td>
          </tr>`;
        })
        .join('')}</tbody>
    </table></div>` : `<p>${show === 'active' ? 'Aucune erreur active. Bien joué, ou il est temps de faire un quiz.' : 'Rien à afficher.'}</p>`}`;
}
