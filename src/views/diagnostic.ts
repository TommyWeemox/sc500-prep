// Diagnostic initial : test court par domaine, correction en fin de session.
import { getCtx, getQuestions, objectiveLabel, store } from '../app';
import { esc, formatDate, pct } from '../lib/dom';
import { buildSession } from '../lib/quiz';
import type { Route } from '../lib/router';
import type { Tally } from '../lib/store';
import { runSession } from './quiz';

export async function diagnosticView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const all = await getQuestions();
  const cs = store.cert(ctx.cert);
  const domain = route.query.get('domain');

  if (domain && ctx.domains.has(domain)) {
    const d = ctx.domains.get(domain)!;
    const qs = buildSession(all, ctx.catalog.domains, cs, { mode: 'diagnostic', domain }, store.today());
    if (!qs.length) {
      main.innerHTML = `<h1 tabindex="-1">Diagnostic</h1><p>Le diagnostic de ce domaine n'est pas encore disponible.</p><p><a href="#/diagnostic">Retour</a></p>`;
      return;
    }
    runSession(main, ctx, qs, {
      title: `Diagnostic · ${d.titleFr}`,
      mode: 'diagnostic',
      feedback: 'end',
      intro: "Répondez sans chercher : le but est de mesurer, pas de réussir. Les corrections détaillées sont accessibles à la fin via vos erreurs.",
      onFinish: (results) => {
        const per: Record<string, Tally> = {};
        for (const r of results) {
          per[r.q.objective] ??= { total: 0, correct: 0 };
          per[r.q.objective].total++;
          if (r.correct) per[r.q.objective].correct++;
        }
        store.saveDiagnostic(domain, per, ctx.cert);
        const rows = Object.entries(per)
          .map(([o, t]) => {
            const v = t.correct / t.total;
            const advice = v < 0.5 ? 'Point faible : remonté dans le parcours, temps augmenté.' : v >= 0.8 ? 'Bonne base : temps réduit dans le plan.' : 'Niveau intermédiaire.';
            return `<li><a href="#/cours/${o}">${esc(objectiveLabel(ctx, o))}</a> : ${t.correct}/${t.total} (${pct(v)}). ${advice}</li>`;
          })
          .join('');
        return `<h2>Diagnostic enregistré</h2><ul class="plain">${rows}</ul><p><a class="btn primary" href="#/parcours">Voir le parcours ajusté</a> <a class="btn" href="#/diagnostic">Autre domaine</a></p>`;
      },
    });
    return;
  }

  main.innerHTML = `
    <h1 tabindex="-1">Diagnostic initial</h1>
    <p class="lead">Un test court par domaine (deux questions par objectif) pour repérer vos points faibles. Le parcours et le plan s'ajustent au résultat. Comptez 5 à 10 minutes par domaine.</p>
    <ul class="cards-list">
      ${ctx.catalog.domains
        .map((d) => {
          const res = cs.diagnostic[d.id];
          const n = all.filter((q) => q.diagnostic && q.pool === 'practice' && ctx.domainOf.get(q.objective)?.id === d.id).length;
          const score = res ? Object.values(res.perObjective).reduce((a, t) => ({ total: a.total + t.total, correct: a.correct + t.correct }), { total: 0, correct: 0 }) : null;
          return `<li class="card">
            <h2>${esc(d.titleFr)}</h2>
            <p class="muted">${n} questions${res && score ? ` · passé le ${formatDate(res.at)} : ${score.correct}/${score.total} (${pct(score.correct / score.total)})` : ''}</p>
            <a class="btn ${res ? '' : 'primary'}" href="#/diagnostic?domain=${d.id}" ${n ? '' : 'aria-disabled="true"'}>${res ? 'Refaire' : 'Commencer'}</a>
          </li>`;
        })
        .join('')}
    </ul>`;
}
