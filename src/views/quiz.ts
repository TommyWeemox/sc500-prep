// Quiz : choix du mode et déroulement d'une session (correction immédiate ou en fin de session).
import { getCtx, getQuestions, lessonHref, objectiveLabel, store, type Ctx } from '../app';
import { esc, pct } from '../lib/dom';
import { buildSession, isCorrect, type SessionMode } from '../lib/quiz';
import { go, type Route } from '../lib/router';
import { isDue } from '../lib/srs';
import type { Question } from '../lib/types';
import { renderQuestionView, type QuestionView } from './question';

export async function quizSetupView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const qs = await getQuestions();
  const cs = store.cert(ctx.cert);
  const today = store.today();
  const mistakes = Object.values(cs.mistakes).filter((m) => !m.resolved).length;
  const due = qs.filter((q) => isDue(cs.questions[q.id]?.srs, today)).length;
  const studied = Object.values(cs.lessons).filter((l) => l.doneAt).length;
  const practice = qs.filter((q) => q.pool === 'practice');
  const countBy = (pred: (q: Question) => boolean) => practice.filter(pred).length;

  const objOptions = ctx.catalog.domains
    .map((d) => `<optgroup label="${esc(d.titleFr)}">${d.objectives.map((o) => `<option value="${o.id}" ${countBy((q) => q.objective === o.id) ? '' : 'disabled'}>${esc(o.id)} · ${esc(o.titleFr)} (${countBy((q) => q.objective === o.id)})</option>`).join('')}</optgroup>`)
    .join('');
  const domOptions = ctx.catalog.domains.map((d) => `<option value="${d.id}">${esc(d.titleFr)} (${countBy((q) => ctx.domainOf.get(q.objective)?.id === d.id)})</option>`).join('');

  main.innerHTML = `
    <h1 tabindex="-1">Quiz</h1>
    <p class="lead">La plupart des questions partent d'un cas d'entreprise. Après chaque réponse, vous voyez pourquoi chaque option est juste ou fausse, avec un lien vers la leçon.</p>
    <div class="grid cards-2">
      <form class="card" data-mode="objective">
        <h2>Par objectif</h2>
        <p>Consolider un objectif juste après la leçon.</p>
        <label>Objectif <select name="objective">${objOptions}</select></label>
        <button class="btn primary">Commencer</button>
      </form>
      <form class="card" data-mode="domain">
        <h2>Par domaine</h2>
        <p>Les objectifs d'un domaine, entrelacés.</p>
        <label>Domaine <select name="domain">${domOptions}</select></label>
        <label>Nombre de questions <input type="number" name="count" min="5" max="60" value="15"></label>
        <button class="btn primary">Commencer</button>
      </form>
      <form class="card" data-mode="mixed">
        <h2>Mélangé</h2>
        <p>Tous les objectifs alternés. C'est l'entrelacement : plus difficile, mais on retient mieux.</p>
        <label class="check"><input type="checkbox" name="onlyStudied" ${studied >= 2 ? 'checked' : 'disabled'}> Seulement les objectifs déjà étudiés (${studied})</label>
        <label>Nombre de questions <input type="number" name="count" min="5" max="60" value="20"></label>
        <button class="btn primary">Commencer</button>
      </form>
      <form class="card" data-mode="mistakes">
        <h2>Mes erreurs</h2>
        <p>${mistakes ? `${mistakes} question(s) ratée(s) non encore maîtrisée(s). Une question sort de la liste après deux bonnes réponses d'affilée.` : 'Aucune erreur active pour le moment.'}</p>
        <label>Nombre de questions <input type="number" name="count" min="1" max="60" value="${Math.min(Math.max(mistakes, 1), 20)}"></label>
        <button class="btn primary" ${mistakes ? '' : 'disabled'}>Commencer</button>
      </form>
      <form class="card" data-mode="due">
        <h2>Révisions du jour</h2>
        <p>${due ? `${due} question(s) ratée(s) à revoir aujourd'hui selon la répétition espacée.` : "Rien à revoir aujourd'hui côté questions."}</p>
        <input type="hidden" name="count" value="50">
        <button class="btn primary" ${due ? '' : 'disabled'}>Commencer</button>
      </form>
    </div>`;

  for (const form of main.querySelectorAll<HTMLFormElement>('form[data-mode]')) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const p = new URLSearchParams({ mode: form.dataset.mode! });
      for (const [k, v] of fd) p.set(k, k === 'onlyStudied' ? '1' : String(v));
      go(`#/quiz/run?${p}`);
    });
  }
}

export async function quizRunView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const all = await getQuestions();
  const q = route.query;
  const mode = (q.get('mode') ?? 'mixed') as SessionMode;
  const questions = buildSession(all, ctx.catalog.domains, store.cert(ctx.cert), {
    mode,
    objective: q.get('objective') ?? undefined,
    domain: q.get('domain') ?? undefined,
    count: Number(q.get('count') ?? 10),
    onlyStudied: q.get('onlyStudied') === '1',
    id: q.get('id') ?? undefined,
  }, store.today());

  const titles: Record<string, string> = {
    objective: `Quiz · ${objectiveLabel(ctx, q.get('objective') ?? '')}`,
    domain: `Quiz · ${ctx.domains.get(q.get('domain') ?? '')?.titleFr ?? ''}`,
    mixed: 'Quiz mélangé',
    mistakes: 'Mes erreurs',
    due: 'Révisions du jour',
    question: 'Question',
    diagnostic: 'Diagnostic',
  };
  if (!questions.length) {
    main.innerHTML = `<h1 tabindex="-1">${esc(titles[mode] ?? 'Quiz')}</h1><p>Aucune question disponible pour ce choix.</p><p><a class="btn" href="#/quiz">Retour aux modes de quiz</a></p>`;
    return;
  }
  runSession(main, ctx, questions, { title: titles[mode] ?? 'Quiz', mode, feedback: 'immediate' });
}

export interface SessionConfig {
  title: string;
  mode: string;
  feedback: 'immediate' | 'end';
  intro?: string;
  onFinish?: (results: { q: Question; correct: boolean; answer: string[] }[]) => string;
}

/** Déroule une session question par question. */
export function runSession(main: HTMLElement, ctx: Ctx, questions: Question[], cfg: SessionConfig): void {
  const results: { q: Question; correct: boolean; answer: string[] }[] = [];
  let i = 0;
  let view: QuestionView | null = null;
  let revealed = false;

  main.innerHTML = `
    <div class="session">
      <div class="session-head">
        <h1 tabindex="-1">${esc(cfg.title)}</h1>
        <div class="session-progress" role="progressbar" aria-label="Avancement" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="0"><span></span></div>
      </div>
      ${cfg.intro ? `<p class="lead">${cfg.intro}</p>` : ''}
      <div class="q-slot"></div>
      <div class="q-actions">
        <button type="button" class="btn primary" data-act="main">Valider</button>
        <span class="kbd-hint">Raccourcis : 1 à 6 ou A à F pour choisir, Entrée pour valider</span>
      </div>
    </div>`;
  const slot = main.querySelector<HTMLElement>('.q-slot')!;
  const btn = main.querySelector<HTMLButtonElement>('[data-act="main"]')!;
  const bar = main.querySelector<HTMLElement>('.session-progress')!;

  const show = () => {
    const q = questions[i];
    revealed = false;
    view = renderQuestionView(q, { index: i, total: questions.length, objectiveLabel: objectiveLabel(ctx, q.objective), onChange: () => (btn.disabled = !view!.hasAnswer()) });
    slot.replaceChildren(view.el);
    btn.textContent = cfg.feedback === 'immediate' ? 'Valider' : i === questions.length - 1 ? 'Terminer' : 'Question suivante';
    btn.disabled = !view.hasAnswer();
    bar.setAttribute('aria-valuenow', String(i));
    bar.querySelector('span')!.setAttribute('style', `width:${(i / questions.length) * 100}%`);
    view.el.querySelector<HTMLElement>('.q-stem')?.setAttribute('tabindex', '-1');
    view.el.querySelector<HTMLElement>('.q-stem')?.focus();
  };

  const record = () => {
    const q = questions[i];
    const answer = view!.answer();
    const correct = isCorrect(q, answer);
    results.push({ q, correct, answer });
    store.recordAnswer(q, correct, answer, cfg.mode, ctx.cert);
  };

  const next = () => {
    i++;
    if (i < questions.length) show();
    else finish();
  };

  const onMain = () => {
    if (!view) return;
    if (cfg.feedback === 'immediate') {
      if (!revealed) {
        if (!view.hasAnswer()) return;
        record();
        view.reveal();
        revealed = true;
        btn.textContent = i === questions.length - 1 ? 'Voir le bilan' : 'Question suivante';
        btn.disabled = false;
        btn.focus();
      } else next();
    } else {
      if (!view.hasAnswer()) return;
      record();
      next();
    }
  };
  btn.addEventListener('click', onMain);

  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(main.querySelector('.session'))) return document.removeEventListener('keydown', onKey);
    if (e.key === 'Enter' && !(e.target as HTMLElement).matches('button, a, textarea, summary')) {
      e.preventDefault();
      onMain();
      return;
    }
    if (view?.key(e)) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const finish = () => {
    document.removeEventListener('keydown', onKey);
    const ok = results.filter((r) => r.correct).length;
    const perObj = new Map<string, { t: number; c: number }>();
    for (const r of results) {
      const x = perObj.get(r.q.objective) ?? { t: 0, c: 0 };
      x.t++;
      if (r.correct) x.c++;
      perObj.set(r.q.objective, x);
    }
    const extra = cfg.onFinish?.(results) ?? '';
    const missed = results.filter((r) => !r.correct);
    main.innerHTML = `
      <h1 tabindex="-1">Bilan · ${esc(cfg.title)}</h1>
      <p class="score-big">${ok} / ${results.length} <span>(${pct(results.length ? ok / results.length : 0)})</span></p>
      ${extra}
      <h2>Par objectif</h2>
      <ul class="plain">${[...perObj].map(([o, x]) => `<li><a href="${lessonHref(o)}">${esc(objectiveLabel(ctx, o))}</a> : ${x.c}/${x.t}</li>`).join('')}</ul>
      ${missed.length ? `<h2>À revoir</h2><p>Ces questions sont dans votre journal d'erreurs et reviendront selon la répétition espacée.</p>
        <ol class="missed">${missed.map((r) => `<li><a href="#/quiz/run?mode=question&id=${encodeURIComponent(r.q.id)}">${r.q.stem}</a> <span class="muted">(${esc(r.q.objective)})</span></li>`).join('')}</ol>` : '<p>Aucune erreur sur cette session.</p>'}
      <p class="actions">
        ${missed.length ? '<a class="btn primary" href="#/quiz/run?mode=mistakes&count=20">Rejouer mes erreurs</a>' : ''}
        <a class="btn" href="#/quiz">Autre quiz</a>
        <a class="btn" href="#/">Tableau de bord</a>
      </p>`;
    main.querySelector<HTMLElement>('h1')?.focus();
  };

  show();
}
