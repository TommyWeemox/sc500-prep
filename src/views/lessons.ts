// Cours : index par domaine et page de leçon (rappel actif avant et après lecture, Feynman).
import { getCards, getCtx, getMastery, getQuestions, store } from '../app';
import { data } from '../lib/data';
import { enhance, esc, formatDate, pct, progressBar } from '../lib/dom';
import { masteryLabel } from '../lib/mastery';
import type { Route } from '../lib/router';

export async function lessonsIndexView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const cs = store.cert(ctx.cert);
  const mastery = await getMastery(ctx);
  const lessons = new Map(ctx.catalog.lessons.map((l) => [l.objective, l]));
  const path = ctx.catalog.path;
  main.innerHTML = `
    <h1 tabindex="-1">Cours</h1>
    <p class="lead">Une leçon par objectif officiel du guide d'étude ${esc(ctx.catalog.cert.code)}. Chaque leçon commence par des questions avant lecture et finit par un rappel sans aide et un exercice « explique-le en 5 lignes ».</p>
    ${ctx.catalog.domains
      .map(
        (d) => `<section class="domain-block">
          <h2>${esc(d.titleFr)} <span class="muted">${d.weight.min}-${d.weight.max} %</span></h2>
          <ul class="lesson-list">
            ${d.objectives
              .map((o) => {
                const l = lessons.get(o.id);
                const st = cs.lessons[o.id];
                const m = mastery.get(o.id)!;
                const depth = path?.objectives[o.id]?.depth;
                return `<li class="lesson-row ${l ? '' : 'disabled'}">
                  <div>
                    ${l ? `<a href="#/cours/${o.id}"><strong>${esc(o.id)}</strong> ${esc(o.titleFr)}</a>` : `<span><strong>${esc(o.id)}</strong> ${esc(o.titleFr)}</span> <span class="tag">bientôt</span>`}
                    <div class="muted small">${esc(o.title)}${l ? ` · ${l.minutes} min` : ''}${depth ? ` · <span class="tag tag-${depth}">${depth === 'rappel' ? 'Rappel rapide' : 'Approfondi'}</span>` : ''}${st?.doneAt ? ' · <span class="tag tag-ok">Lue</span>' : ''}</div>
                  </div>
                  <div class="row-mastery">${progressBar(m.score, `Maîtrise ${o.id}`)}<span class="small">${masteryLabel(m.score)}</span></div>
                </li>`;
              })
              .join('')}
          </ul>
        </section>`,
      )
      .join('')}`;
}

export async function lessonView(route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const id = route.params.id;
  const o = ctx.objectives.get(id);
  if (!o || !ctx.catalog.lessons.some((l) => l.objective === id)) {
    main.innerHTML = `<h1 tabindex="-1">Leçon indisponible</h1><p>Aucune leçon pour l'objectif ${esc(id)}.</p><p><a href="#/cours">Retour au cours</a></p>`;
    return;
  }
  const [lesson, questions, cards] = await Promise.all([data.lesson(ctx.cert, id), getQuestions(), getCards()]);
  const d = ctx.domainOf.get(id)!;
  const st = store.cert(ctx.cert).lessons[id] ?? {};
  const mastery = (await getMastery(ctx)).get(id)!;
  const labs = ctx.catalog.labs.filter((l) => l.objectives.includes(id));
  const nQ = questions.filter((q) => q.objective === id && q.pool === 'practice').length;
  const nC = cards.filter((c) => c.objective === id).length;
  const depth = ctx.catalog.path?.objectives[id];
  const order = ctx.catalog.path?.order ?? [];
  const nextId = order[order.indexOf(id) + 1];
  const pre = st.pre ?? [];

  main.innerHTML = `
    <nav class="crumbs" aria-label="Fil d'Ariane"><a href="#/cours">Cours</a> › ${esc(d.titleFr)}</nav>
    <header class="lesson-head">
      <p class="eyebrow">Objectif ${esc(id)} · ${esc(o.title)}</p>
      <h1 tabindex="-1">${esc(lesson.title)}</h1>
      <p class="meta">${lesson.minutes} min de lecture · vérifié sur Microsoft Learn le ${formatDate(lesson.verified)}${depth ? ` · <span class="tag tag-${depth.depth}">${depth.depth === 'rappel' ? 'Rappel rapide pour votre profil' : 'Approfondi pour votre profil'}</span>` : ''}</p>
      <div class="lesson-mastery">${progressBar(mastery.score, 'Maîtrise estimée')}<span class="small">Maîtrise estimée : ${pct(mastery.score)} (${masteryLabel(mastery.score)})</span></div>
    </header>

    <section class="active-recall pre" aria-labelledby="pre-title">
      <h2 id="pre-title">Avant de lire</h2>
      <p>Répondez de tête, même approximativement. Se tromper avant de lire aide à retenir. Vos réponses restent dans ce navigateur.</p>
      <ol>${lesson.preQuestions.map((q, i) => `<li><label for="pre-${i}">${q}</label><textarea id="pre-${i}" rows="2" data-pre="${i}">${esc(pre[i] ?? '')}</textarea></li>`).join('')}</ol>
    </section>

    <div class="lesson-layout">
      <aside class="toc" aria-label="Sommaire de la leçon">
        <p class="toc-title">Sommaire</p>
        <ol>${lesson.toc.map((h) => `<li><a href="#/cours/${id}#${h.id}">${esc(h.text)}</a></li>`).join('')}<li><a href="#/cours/${id}#rappel">Rappel sans aide</a></li><li><a href="#/cours/${id}#feynman">Explique-le en 5 lignes</a></li></ol>
      </aside>
      <div class="prose lesson-body">${lesson.html}</div>
    </div>

    <section class="active-recall" id="rappel" aria-labelledby="recall-title">
      <h2 id="recall-title">Rappel sans aide</h2>
      <p>Fermez la leçon de votre tête : répondez sans remonter, puis comparez.</p>
      <ol class="recall">${lesson.recall
        .map(
          (r, i) => `<li>
            <p class="recall-q">${r.q}</p>
            <textarea rows="3" aria-label="Votre réponse" data-recall="${i}">${esc(st.recall?.[i] ?? '')}</textarea>
            <details><summary>Voir la réponse attendue</summary><div class="prose">${r.a}</div></details>
          </li>`,
        )
        .join('')}</ol>
    </section>

    ${lesson.feynman ? `<section class="feynman" id="feynman" aria-labelledby="feyn-title">
      <h2 id="feyn-title">Explique-le en 5 lignes</h2>
      <p>${lesson.feynman.prompt}</p>
      <textarea id="feynman-text" rows="6" aria-label="Votre explication">${esc(st.feynman ?? '')}</textarea>
      <p class="small muted" id="feyn-count"></p>
      <button type="button" class="btn" data-act="feynman">Comparer avec la réponse modèle</button>
      <div class="model" hidden><h3>Réponse modèle</h3><div class="prose">${lesson.feynman.model}</div><p class="small">Comparez : avez-vous dit pourquoi, pas seulement quoi ? Avez-vous cité une limite ? Ce qui manque est ce qu'il faut relire.</p></div>
    </section>` : ''}

    <section class="lesson-end">
      <h2>Et maintenant</h2>
      <p><button type="button" class="btn ${st.doneAt ? '' : 'primary'}" data-act="done">${st.doneAt ? `Leçon marquée comme lue le ${formatDate(st.doneAt)} (annuler)` : 'Marquer la leçon comme lue'}</button></p>
      <ul class="next-steps">
        <li><a href="#/quiz/run?mode=objective&objective=${id}&count=10">Quiz de l'objectif (${nQ} questions)</a></li>
        <li><a href="#/flashcards?objective=${id}">Flashcards de l'objectif (${nC})</a></li>
        ${labs.map((l) => `<li><a href="#/labs/${l.id}">Lab : ${esc(l.title)}</a></li>`).join('')}
        <li><a href="${esc(o.learningPath.url)}" target="_blank" rel="noopener noreferrer" class="ext">Parcours Microsoft Learn : ${esc(o.learningPath.title)}</a></li>
        ${nextId ? `<li><a href="#/cours/${nextId}">Leçon suivante du parcours : ${esc(ctx.objectives.get(nextId)?.titleFr ?? nextId)}</a></li>` : ''}
      </ul>
      <h3>Sous-objectifs officiels couverts</h3>
      <ul class="skills">${o.skills.map((s) => `<li><a href="#/cours/${id}#s-${s.id.replace(/\./g, '-')}">${esc(s.id)}</a> ${esc(s.text)}</li>`).join('')}</ul>
      <h3>Sources Microsoft Learn</h3>
      <ul class="sources">${lesson.sources.map((s) => `<li><a class="ext" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="muted small">vérifié le ${formatDate(s.verified ?? lesson.verified)}</span></li>`).join('')}</ul>
    </section>`;

  await enhance(main.querySelector('.lesson-body')!);
  for (const det of main.querySelectorAll<HTMLElement>('.recall .prose, .model .prose')) void enhance(det);

  // Sauvegarde des réponses avant lecture et du rappel.
  main.addEventListener('input', (e) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.dataset.pre !== undefined) {
      const arr = [...(store.cert(ctx.cert).lessons[id]?.pre ?? [])];
      arr[Number(t.dataset.pre)] = t.value;
      store.updateLesson(id, { pre: arr }, ctx.cert);
    } else if (t.dataset.recall !== undefined) {
      const arr = [...(store.cert(ctx.cert).lessons[id]?.recall ?? [])];
      arr[Number(t.dataset.recall)] = t.value;
      store.updateLesson(id, { recall: arr, recallAt: new Date().toISOString() }, ctx.cert);
    } else if (t.id === 'feynman-text') {
      store.updateLesson(id, { feynman: t.value }, ctx.cert);
      countLines();
    }
  });
  const countLines = () => {
    const t = main.querySelector<HTMLTextAreaElement>('#feynman-text');
    const c = main.querySelector('#feyn-count');
    if (!t || !c) return;
    const n = t.value.split(/\n/).filter((l) => l.trim()).length;
    c.textContent = `${n} ligne(s)${n > 5 ? ' : visez 5 lignes maximum, la contrainte force à choisir l\'essentiel' : ''}`;
  };
  countLines();

  main.querySelector('[data-act="feynman"]')?.addEventListener('click', (e) => {
    const t = main.querySelector<HTMLTextAreaElement>('#feynman-text')!;
    if (t.value.trim().length < 40 && !window.confirm('Votre explication est très courte. Voir quand même la réponse modèle ?')) return;
    main.querySelector<HTMLElement>('.model')!.hidden = false;
    store.updateLesson(id, { feynmanAt: new Date().toISOString() }, ctx.cert);
    (e.currentTarget as HTMLElement).remove();
  });
  main.querySelector('[data-act="done"]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    const done = store.cert(ctx.cert).lessons[id]?.doneAt;
    const l = store.updateLesson(id, { doneAt: done ? undefined : new Date().toISOString() }, ctx.cert);
    btn.textContent = l.doneAt ? `Leçon marquée comme lue le ${formatDate(l.doneAt)} (annuler)` : 'Marquer la leçon comme lue';
    btn.classList.toggle('primary', !l.doneAt);
  });
}
