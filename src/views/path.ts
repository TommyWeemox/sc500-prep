// Parcours guidé : profil, ordre recommandé et plan semaine par semaine.
import { getCtx, store } from '../app';
import { esc, formatDate, pct } from '../lib/dom';
import { adjustedHours, diagnosticScores, recommendedOrder } from '../lib/planner';
import { go, type Route } from '../lib/router';
import { addDays } from '../lib/srs';
import { computePlan } from './dashboard';

export async function pathView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const cs = store.cert(ctx.cert);
  const path = ctx.catalog.path;
  if (!path) {
    main.innerHTML = '<h1 tabindex="-1">Parcours</h1><p>Aucun parcours défini pour cette certification.</p>';
    return;
  }
  const diag = diagnosticScores(cs.diagnostic);
  const order = recommendedOrder(path, diag);
  const hours = adjustedHours(path, diag);
  const plan = computePlan(ctx);
  const today = store.today();
  const defaultDate = cs.settings.examDate ?? addDays(today, 7 * 16);

  main.innerHTML = `
    <h1 tabindex="-1">Parcours guidé</h1>
    <p class="lead">${esc(path.profile)}</p>

    <form class="card form-inline" id="plan-form">
      <h2>Votre plan</h2>
      <label>Date d'examen <input type="date" name="examDate" required min="${addDays(today, 1)}" value="${esc(defaultDate)}"></label>
      <label>Heures par semaine <input type="number" name="hoursPerWeek" min="1" max="40" step="0.5" value="${cs.settings.hoursPerWeek}"></label>
      <label>Début du plan <input type="date" name="startDate" value="${esc(cs.settings.startDate ?? today)}"></label>
      <button class="btn primary">Calculer le plan</button>
    </form>

    <section>
      <h2>Ordre recommandé</h2>
      <p class="muted small">Ordre de base : l'identité d'abord (tout le reste s'y appuie), le réseau en rappel rapide, l'IA après l'identité et Defender for Cloud. ${diag.size ? 'Le diagnostic a ajusté l\'ordre et les heures : un objectif sous 50 % remonte et reçoit 30 % de temps en plus ; au-dessus de 80 %, 30 % de moins.' : '<a href="#/diagnostic">Passez le diagnostic</a> pour ajuster ordre et durées à vos résultats.'}</p>
      <ol class="path-list">
        ${order
          .map((id) => {
            const o = ctx.objectives.get(id)!;
            const p = path.objectives[id];
            const s = diag.get(id);
            const done = cs.lessons[id]?.doneAt;
            return `<li class="${done ? 'done' : ''}">
              <div><a href="#/cours/${id}"><strong>${esc(id)}</strong> ${esc(o.titleFr)}</a>
              <span class="tag tag-${p.depth}">${p.depth === 'rappel' ? 'Rappel rapide' : 'Approfondi'}</span>
              ${s !== undefined ? `<span class="tag ${s < 0.5 ? 'tag-warn' : s >= 0.8 ? 'tag-ok' : ''}">diagnostic ${pct(s)}</span>` : ''}
              ${done ? '<span class="tag tag-ok">Lue</span>' : ''}</div>
              <p class="small">${esc(p.why)} <span class="muted">· environ ${hours.get(id)} h leçon, quiz, flashcards et labs compris</span></p>
            </li>`;
          })
          .join('')}
      </ol>
    </section>

    ${plan ? `<section>
      <h2>Plan semaine par semaine</h2>
      <p>${plan.weeks.length} semaine(s) jusqu'au ${formatDate(cs.settings.examDate)}. Besoin estimé : ${plan.totalHoursNeeded} h d'apprentissage ; disponible : ${plan.totalHoursAvailable} h (hors révisions).</p>
      ${plan.tooShort ? '<p class="callout callout-warn">Moins de deux semaines : concentrez-vous sur les fiches de synthèse, les points faibles et un examen blanc.</p>' : ''}
      ${plan.compressed ? `<p class="callout callout-warn">Le temps disponible ne couvre que ${pct(plan.ratio)} du besoin estimé. Le plan est compressé : augmentez les heures par semaine ou repoussez la date si possible.</p>` : ''}
      <div class="table-wrap" tabindex="0"><table class="plan">
        <thead><tr><th scope="col">Semaine</th><th scope="col">Dates</th><th scope="col">Au programme</th><th scope="col">Heures</th></tr></thead>
        <tbody>${plan.weeks
          .map((w) => `<tr class="${w.start <= today && today <= w.end ? 'current' : ''}">
            <td>${w.index}</td>
            <td>${formatDate(w.start)} au ${formatDate(w.end)}</td>
            <td><ul class="plain">${w.items.map((it) => `<li>${it.objective ? `<a href="#/cours/${it.objective}">${esc(it.label)}</a>${it.continued ? ' (suite)' : ''}` : esc(it.label)} <span class="muted">${it.hours} h</span></li>`).join('')}</ul></td>
            <td>${w.hours}</td>
          </tr>`)
          .join('')}</tbody>
      </table></div>
    </section>` : '<p>Saisissez votre date d\'examen pour obtenir le plan semaine par semaine.</p>'}`;

  main.querySelector<HTMLFormElement>('#plan-form')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    store.updateSettings({
      examDate: String(fd.get('examDate')),
      hoursPerWeek: Math.max(1, Number(fd.get('hoursPerWeek')) || 6),
      startDate: String(fd.get('startDate') || today),
    }, ctx.cert);
    go('#/parcours');
  });
}
