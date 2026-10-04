// Tableau de bord : révisions du jour, prochaine étape, maîtrise par objectif, points faibles.
import { getCards, getCtx, getMastery, getQuestions, objectiveLabel, store, type Ctx } from '../app';
import { esc, formatDate, pct, progressBar } from '../lib/dom';
import { domainMastery, masteryLabel, weakPoints } from '../lib/mastery';
import { adjustedHours, buildPlan, diagnosticScores, recommendedOrder, type Plan } from '../lib/planner';
import type { Route } from '../lib/router';
import { addDays, daysBetween, isDue } from '../lib/srs';

export function computePlan(ctx: Ctx): Plan | null {
  const cs = store.cert(ctx.cert);
  const path = ctx.catalog.path;
  if (!path || !cs.settings.examDate) return null;
  const diag = diagnosticScores(cs.diagnostic);
  const start = cs.settings.startDate ?? store.today();
  return buildPlan({
    start,
    examDate: cs.settings.examDate,
    hoursPerWeek: cs.settings.hoursPerWeek,
    order: recommendedOrder(path, diag),
    hours: adjustedHours(path, diag),
    titles: new Map([...ctx.objectives].map(([id, o]) => [id, `${id} · ${o.titleFr}`])),
    finalReview: path.finalReview,
  });
}

export async function dashboardView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const [questions, cards, mastery] = await Promise.all([getQuestions(), getCards(), getMastery(ctx)]);
  const cs = store.cert(ctx.cert);
  const today = store.today();
  const dueCards = cards.filter((c) => cs.cards[c.id] && isDue(cs.cards[c.id].srs, today)).length;
  const newCards = Math.min(cs.settings.newCardsPerDay, cards.filter((c) => !cs.cards[c.id]).length);
  const dueQuestions = questions.filter((q) => isDue(cs.questions[q.id]?.srs, today)).length;
  const activeMistakes = Object.values(cs.mistakes).filter((m) => !m.resolved).length;
  const lessonsDone = Object.values(cs.lessons).filter((l) => l.doneAt).length;
  const weak = weakPoints(mastery);
  const plan = computePlan(ctx);
  const week = plan?.weeks.find((w) => w.start <= today && today <= w.end) ?? plan?.weeks[0];
  const daysLeft = cs.settings.examDate ? daysBetween(today, cs.settings.examDate) : null;
  const diagDone = Object.keys(cs.diagnostic).length;

  // Série de jours d'activité consécutifs.
  let streak = 0;
  for (let d = today; cs.activity[d]; d = addDays(d, -1)) streak++;
  const last7 = cs.history.filter((h) => h.at.slice(0, 10) >= addDays(today, -6));
  const acc7 = last7.length ? last7.filter((h) => h.correct).length / last7.length : null;

  const order = ctx.catalog.path?.order ?? [...ctx.objectives.keys()];
  const nextLesson = order.find((id) => !cs.lessons[id]?.doneAt && ctx.catalog.lessons.some((l) => l.objective === id));

  const onboarding = !cs.settings.examDate || !diagDone
    ? `<section class="card onboarding">
        <h2>Pour démarrer</h2>
        <ol class="steps">
          <li class="${cs.settings.examDate ? 'done' : ''}"><a href="#/parcours">Saisir votre date d'examen</a> pour obtenir un plan semaine par semaine.</li>
          <li class="${diagDone ? 'done' : ''}"><a href="#/diagnostic">Passer le diagnostic</a> (6 questions par domaine) pour repérer vos points faibles. Le plan s'ajuste au résultat.</li>
          <li><a href="#/cours/${nextLesson ?? '1.1'}">Lire la première leçon du parcours</a>.</li>
        </ol>
      </section>`
    : '';

  main.innerHTML = `
    <h1 tabindex="-1">Tableau de bord</h1>
    ${daysLeft !== null ? `<p class="lead">Examen ${esc(ctx.catalog.cert.code)} le ${formatDate(cs.settings.examDate)} : ${daysLeft >= 0 ? `J-${daysLeft}` : 'date passée'}.</p>` : ''}
    ${onboarding}
    <div class="grid cards-3">
      <section class="card">
        <h2>Révisions du jour</h2>
        <ul class="plain stats">
          <li><strong>${dueCards}</strong> flashcard(s) à revoir, <strong>${newCards}</strong> nouvelle(s)</li>
          <li><strong>${dueQuestions}</strong> question(s) ratée(s) à revoir</li>
          <li><strong>${activeMistakes}</strong> erreur(s) active(s) dans le journal</li>
        </ul>
        <p class="actions">
          <a class="btn primary" href="#/flashcards">Flashcards</a>
          ${dueQuestions ? '<a class="btn" href="#/quiz/run?mode=due&count=50">Questions du jour</a>' : ''}
        </p>
      </section>
      <section class="card">
        <h2>Prochaine étape</h2>
        ${week ? `<p class="muted small">Semaine ${week.index} du plan (${formatDate(week.start)} au ${formatDate(week.end)})</p>
          <ul class="plain">${week.items.map((it) => `<li>${it.objective ? `<a href="#/cours/${it.objective}">${esc(it.label)}</a>` : esc(it.label)} <span class="muted">${it.hours} h</span></li>`).join('')}</ul>`
        : nextLesson ? `<p><a href="#/cours/${nextLesson}">${esc(objectiveLabel(ctx, nextLesson))}</a></p>` : '<p>Toutes les leçons sont lues. Place aux examens blancs.</p>'}
        <p><a href="#/parcours">Voir le plan complet</a></p>
      </section>
      <section class="card">
        <h2>Activité</h2>
        <ul class="plain stats">
          <li><strong>${streak}</strong> jour(s) d'affilée</li>
          <li><strong>${lessonsDone}</strong> / ${ctx.objectives.size} leçons lues</li>
          <li><strong>${last7.length}</strong> réponses sur 7 jours${acc7 !== null ? ` · ${pct(acc7)} justes` : ''}</li>
          <li><strong>${Object.keys(cs.labs).length}</strong> / ${ctx.catalog.labs.length} labs faits · <strong>${cs.exams.length}</strong> examen(s) blanc(s)</li>
        </ul>
      </section>
    </div>

    <section>
      <h2>Points faibles</h2>
      ${weak.length ? `<ul class="plain">${weak.map((w) => `<li><a href="#/cours/${w.objective}">${esc(objectiveLabel(ctx, w.objective))}</a> : ${pct(w.score)} <span class="muted">(${w.answered} réponses)</span> · <a href="#/quiz/run?mode=objective&objective=${w.objective}&count=10">quiz ciblé</a></li>`).join('')}</ul>`
        : '<p class="muted">Pas encore assez de réponses pour identifier des points faibles (3 réponses minimum par objectif). Le diagnostic est le moyen le plus rapide d\'en avoir.</p>'}
    </section>

    <section>
      <h2>Maîtrise estimée par objectif</h2>
      <p class="muted small">Estimation : réponses récentes (pondérées vers les plus récentes), rétention des flashcards et leçon lue. Avec moins de 5 réponses, l'estimation est volontairement prudente.</p>
      ${ctx.catalog.domains
        .map(
          (d) => `<div class="domain-mastery">
            <h3>${esc(d.titleFr)} <span class="muted">${d.weight.min}-${d.weight.max} % · ${pct(domainMastery(d, mastery))}</span></h3>
            <ul class="bars">${d.objectives
              .map((o) => {
                const m = mastery.get(o.id)!;
                return `<li><a href="#/cours/${o.id}">${esc(o.id)} ${esc(o.titleFr)}</a>${progressBar(m.score, `Maîtrise ${o.id}`)}<span class="small">${pct(m.score)} · ${masteryLabel(m.score)} <span class="muted">(confiance ${m.confidence})</span></span></li>`;
              })
              .join('')}</ul>
          </div>`,
        )
        .join('')}
    </section>`;
}
