// Examen blanc chronométré : pas de correction pendant l'épreuve, score par domaine à la fin.
import { getCtx, getQuestions, objectiveLabel, store, type Ctx } from '../app';
import { esc, formatDate, formatDuration, pct, progressBar } from '../lib/dom';
import { generateExam, isCorrect, scaledScore, scoreAnswers, shuffle } from '../lib/quiz';
import { go, type Route } from '../lib/router';
import type { ExamResult } from '../lib/store';
import type { Question } from '../lib/types';
import { explanation, renderQuestionView } from './question';

const GENERATED_ID = 'generated';

export async function examHomeView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const cs = store.cert(ctx.cert);
  const exams = ctx.catalog.exams;
  const hist = [...cs.exams].reverse();
  main.innerHTML = `
    <h1 tabindex="-1">Examen blanc</h1>
    <p class="lead">Conditions proches du réel : ${ctx.catalog.cert.durationMinutes} minutes, tous les domaines selon les pondérations officielles, aucune correction avant la fin. Le score sur 1000 est indicatif : le barème réel de Microsoft n'est pas public, seul le seuil de ${ctx.catalog.cert.passingScore} l'est.</p>
    <div class="grid cards-2">
      ${exams
        .map(
          (e) => `<div class="card">
            <h2>${esc(e.title)}</h2>
            <p>${esc(e.description)}</p>
            <p class="muted">${e.count} questions inédites (absentes des quiz) · ${e.durationMinutes} min</p>
            <a class="btn primary" href="#/examen/run?id=${encodeURIComponent(e.id)}">Commencer</a>
          </div>`,
        )
        .join('')}
      <form class="card" id="gen">
        <h2>Examen généré</h2>
        <p>Tirage dans la banque de questions d'entraînement, réparti selon les pondérations des domaines. Utile pour refaire un examen différent à chaque fois.</p>
        <label>Nombre de questions <input type="number" name="count" min="20" max="80" value="50"></label>
        <label>Durée (minutes) <input type="number" name="minutes" min="10" max="180" value="${ctx.catalog.cert.durationMinutes}"></label>
        <button class="btn primary">Commencer</button>
      </form>
    </div>
    <h2>Historique</h2>
    ${hist.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Date</th><th scope="col">Examen</th><th scope="col">Score</th><th scope="col">Durée</th><th scope="col"></th></tr></thead><tbody>
      ${hist.map((r) => `<tr><td>${formatDate(r.at)}</td><td>${esc(r.title)}</td><td>${scaledScore(r.correct, r.total)} / 1000 (${r.correct}/${r.total})</td><td>${formatDuration(r.durationSec)}</td><td><a href="#/examen/resultat/${encodeURIComponent(r.id)}">Détail</a></td></tr>`).join('')}
    </tbody></table></div>` : '<p>Aucun examen blanc passé pour le moment.</p>'}`;
  main.querySelector<HTMLFormElement>('#gen')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    go(`#/examen/run?id=${GENERATED_ID}&count=${fd.get('count')}&minutes=${fd.get('minutes')}`);
  });
}

export async function examRunView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const all = await getQuestions();
  const id = route.query.get('id') ?? '';
  let questions: Question[];
  let title: string;
  let minutes: number;
  if (id === GENERATED_ID) {
    const count = Math.min(80, Math.max(20, Number(route.query.get('count') ?? 50)));
    questions = generateExam(all.filter((q) => q.pool === 'practice'), ctx.catalog.domains, count);
    minutes = Math.min(180, Math.max(10, Number(route.query.get('minutes') ?? ctx.catalog.cert.durationMinutes)));
    title = `Examen généré (${questions.length} questions)`;
  } else {
    const meta = ctx.catalog.exams.find((e) => e.id === id);
    if (!meta) {
      main.innerHTML = '<h1 tabindex="-1">Examen introuvable</h1><p><a href="#/examen">Retour</a></p>';
      return;
    }
    questions = shuffle(all.filter((q) => q.pool === id));
    minutes = meta.durationMinutes;
    title = meta.title;
  }
  runExam(main, ctx, questions, title, id, minutes);
}

function runExam(main: HTMLElement, ctx: Ctx, questions: Question[], title: string, examId: string, minutes: number): void {
  const answers: Record<string, string[]> = {};
  const flagged = new Set<string>();
  const startedAt = Date.now();
  const deadline = startedAt + minutes * 60_000;
  let i = 0;
  let timer = 0;
  let done = false;

  main.innerHTML = `
    <div class="exam">
      <div class="exam-bar">
        <h1 tabindex="-1">${esc(title)}</h1>
        <div class="timer" role="timer" aria-live="off"></div>
        <button type="button" class="btn danger" data-act="submit">Terminer l'examen</button>
      </div>
      <nav class="exam-grid" aria-label="Navigation entre les questions"></nav>
      <div class="q-slot"></div>
      <div class="q-actions">
        <button type="button" class="btn" data-act="prev">Précédente</button>
        <button type="button" class="btn" data-act="flag" aria-pressed="false">Marquer pour revoir</button>
        <button type="button" class="btn primary" data-act="next">Suivante</button>
      </div>
    </div>`;
  const slot = main.querySelector<HTMLElement>('.q-slot')!;
  const grid = main.querySelector<HTMLElement>('.exam-grid')!;
  const timerEl = main.querySelector<HTMLElement>('.timer')!;
  const flagBtn = main.querySelector<HTMLButtonElement>('[data-act="flag"]')!;

  const drawGrid = () => {
    grid.innerHTML = questions
      .map((q, k) => {
        const st = [answers[q.id]?.length ? 'answered' : '', flagged.has(q.id) ? 'flagged' : '', k === i ? 'current' : ''].join(' ');
        return `<button type="button" class="cell ${st}" data-go="${k}" aria-label="Question ${k + 1}${answers[q.id]?.length ? ', répondue' : ''}${flagged.has(q.id) ? ', marquée' : ''}" ${k === i ? 'aria-current="true"' : ''}>${k + 1}</button>`;
      })
      .join('');
  };
  const show = () => {
    const q = questions[i];
    const view = renderQuestionView(q, { index: i, total: questions.length, objectiveLabel: '', showMeta: false, initial: answers[q.id], onChange: (a) => { answers[q.id] = a; drawGrid(); } });
    if (q.type === 'order' && !answers[q.id]) answers[q.id] = view.answer();
    slot.replaceChildren(view.el);
    flagBtn.setAttribute('aria-pressed', String(flagged.has(q.id)));
    flagBtn.textContent = flagged.has(q.id) ? 'Retirer le marquage' : 'Marquer pour revoir';
    main.querySelector<HTMLButtonElement>('[data-act="prev"]')!.disabled = i === 0;
    main.querySelector<HTMLButtonElement>('[data-act="next"]')!.textContent = i === questions.length - 1 ? 'Revoir la grille' : 'Suivante';
    drawGrid();
    view.el.querySelector<HTMLElement>('.q-stem')?.setAttribute('tabindex', '-1');
    view.el.querySelector<HTMLElement>('.q-stem')?.focus();
    (main as HTMLElement & { _view?: typeof view })._view = view;
  };
  const tick = () => {
    if (!document.body.contains(timerEl)) return window.clearInterval(timer);
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    timerEl.textContent = `Temps restant ${formatDuration(left)}`;
    timerEl.classList.toggle('low', left < 600);
    if (left === 0) finish(true);
  };

  main.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const goBtn = t.closest<HTMLElement>('[data-go]');
    if (goBtn) { i = Number(goBtn.dataset.go); show(); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'prev' && i > 0) { i--; show(); }
    if (act === 'next') {
      if (i < questions.length - 1) { i++; show(); } else grid.querySelector<HTMLElement>('.cell')?.focus();
    }
    if (act === 'flag') {
      const id = questions[i].id;
      if (flagged.has(id)) flagged.delete(id); else flagged.add(id);
      show();
    }
    if (act === 'submit') {
      const missing = questions.filter((q) => !answers[q.id]?.length).length;
      const msg = missing ? `${missing} question(s) sans réponse. Terminer quand même ?` : 'Terminer et voir le résultat ?';
      if (window.confirm(msg)) finish(false);
    }
  });
  const onKey = (e: KeyboardEvent) => {
    if (done || !document.body.contains(slot)) return document.removeEventListener('keydown', onKey);
    const v = (main as HTMLElement & { _view?: { key(e: KeyboardEvent): boolean } })._view;
    if (v?.key(e)) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const finish = (timeUp: boolean) => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    document.removeEventListener('keydown', onKey);
    const s = scoreAnswers(questions, answers, ctx.catalog.domains);
    const result: ExamResult = {
      id: `${Date.now().toString(36)}`,
      examId,
      title,
      at: new Date().toISOString(),
      durationSec: Math.round((Math.min(Date.now(), deadline) - startedAt) / 1000),
      total: s.total,
      correct: s.correct,
      perDomain: s.perDomain,
      perObjective: s.perObjective,
      answers,
      order: questions.map((q) => q.id),
      flagged: [...flagged],
    };
    for (const q of questions) store.recordAnswer(q, isCorrect(q, answers[q.id] ?? []), answers[q.id] ?? [], 'exam', ctx.cert);
    store.saveExam(result, ctx.cert);
    if (timeUp) window.alert('Temps écoulé : l\'examen est terminé.');
    go(`#/examen/resultat/${result.id}`);
  };

  show();
  tick();
  timer = window.setInterval(tick, 1000);
}

export async function examResultView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const all = await getQuestions();
  const r = store.cert(ctx.cert).exams.find((x) => x.id === route.params.id);
  if (!r) {
    main.innerHTML = '<h1 tabindex="-1">Résultat introuvable</h1><p><a href="#/examen">Retour</a></p>';
    return;
  }
  const byId = new Map(all.map((q) => [q.id, q]));
  const score = scaledScore(r.correct, r.total);
  const pass = score >= ctx.catalog.cert.passingScore;
  const domains = ctx.catalog.domains
    .map((d) => {
      const t = r.perDomain[d.id] ?? { total: 0, correct: 0 };
      const v = t.total ? t.correct / t.total : 0;
      return `<li><span>${esc(d.titleFr)} <span class="muted">(${d.weight.min}-${d.weight.max} %)</span></span>${progressBar(v, d.titleFr)}<span>${t.correct}/${t.total} · ${pct(v)}</span></li>`;
    })
    .join('');
  const weakest = Object.entries(r.perObjective).map(([o, t]) => ({ o, v: t.correct / t.total, t })).sort((a, b) => a.v - b.v).slice(0, 3);
  const review = r.order
    .map((id, k) => {
      const q = byId.get(id);
      if (!q) return '';
      const ans = r.answers[id] ?? [];
      const ok = isCorrect(q, ans);
      const labelOf = (oid: string) => {
        const idx = q.options.findIndex((o) => o.id === oid);
        return idx >= 0 ? 'ABCDEFGHIJ'[idx] : oid;
      };
      const given = q.type === 'order' ? ans.map(labelOf).join(' → ') : ans.map(labelOf).join(', ');
      return `<details class="review ${ok ? 'ok' : 'ko'}">
        <summary><span class="verdict-dot" aria-hidden="true">${ok ? '✓' : '✗'}</span> ${k + 1}. ${q.stem} <span class="muted">(${esc(q.objective)}${r.flagged.includes(id) ? ', marquée' : ''})</span><span class="sr-only">${ok ? 'correcte' : 'incorrecte'}</span></summary>
        ${q.scenario ? `<div class="scenario">${q.scenario}</div>` : ''}
        <ol class="review-opts" type="A">${q.options.map((o) => `<li class="${o.correct ? 'is-right' : ans.includes(o.id) ? 'is-wrong' : ''}">${o.text}${o.why ? `<p class="why">${o.why}</p>` : ''}</li>`).join('')}</ol>
        <p>Votre réponse : <strong>${esc(given || 'aucune')}</strong>${q.type === 'order' ? ` · Ordre attendu : <strong>${(q.correctOrder ?? []).map(labelOf).join(' → ')}</strong>` : ''}</p>
        ${explanation(q)}
      </details>`;
    })
    .join('');
  main.innerHTML = `
    <h1 tabindex="-1">Résultat · ${esc(r.title)}</h1>
    <p class="muted">${formatDate(r.at)} · durée ${formatDuration(r.durationSec)}</p>
    <p class="score-big ${pass ? 'pass' : 'fail'}">${score} / 1000 <span>${pass ? 'au-dessus' : 'en dessous'} du seuil de ${ctx.catalog.cert.passingScore} (${r.correct}/${r.total})</span></p>
    <h2>Score par domaine</h2>
    <ul class="bars">${domains}</ul>
    <h2>Objectifs les plus faibles</h2>
    <ul class="plain">${weakest.map((w) => `<li><a href="#/cours/${w.o}">${esc(objectiveLabel(ctx, w.o))}</a> : ${w.t.correct}/${w.t.total}</li>`).join('')}</ul>
    <p class="actions"><a class="btn primary" href="#/quiz/run?mode=mistakes&count=30">Travailler mes erreurs</a> <a class="btn" href="#/examen">Retour aux examens</a></p>
    <h2>Correction détaillée</h2>
    <p><button type="button" class="btn small" data-act="open-ko">Ouvrir les réponses fausses</button></p>
    <div class="reviews">${review}</div>`;
  main.querySelector('[data-act="open-ko"]')?.addEventListener('click', () => {
    for (const d of main.querySelectorAll<HTMLDetailsElement>('details.review.ko')) d.open = true;
  });
}
