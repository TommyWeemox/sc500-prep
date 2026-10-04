// Affichage d'une question et de sa correction détaillée.
import { lessonHref } from '../app';
import { announce, esc } from '../lib/dom';
import { initialOrder, isCorrect } from '../lib/quiz';
import type { Question } from '../lib/types';

export interface QuestionView {
  el: HTMLElement;
  answer(): string[];
  hasAnswer(): boolean;
  reveal(): boolean;
  focusFirst(): void;
  /** Raccourcis clavier : chiffre = sélectionner l'option n. */
  key(e: KeyboardEvent): boolean;
}

export interface QuestionViewOptions {
  index: number;
  total: number;
  objectiveLabel: string;
  initial?: string[];
  onChange?: (answer: string[]) => void;
  showMeta?: boolean;
}

const LETTERS = 'ABCDEFGHIJ';

function typeHint(q: Question): string {
  if (q.type === 'single') return 'Une seule réponse.';
  if (q.type === 'multiple') return `${q.options.filter((o) => o.correct).length} réponses attendues.`;
  return 'Remettez les étapes dans le bon ordre (boutons ↑ ↓ ou touches Alt+flèches).';
}

export function renderQuestionView(q: Question, opts: QuestionViewOptions): QuestionView {
  const el = document.createElement('article');
  el.className = 'question';
  el.dataset.qid = q.id;
  const name = `q-${q.id}`;
  let order = q.type === 'order' ? (opts.initial?.length ? [...opts.initial] : initialOrder(q)) : [];
  let locked = false;

  const header = `
    <header class="q-head">
      <span class="q-count">Question ${opts.index + 1} / ${opts.total}</span>
      ${opts.showMeta === false ? '' : `<span class="tag">${esc(opts.objectiveLabel)}</span>`}
      ${q.scenario ? '<span class="tag tag-accent">Scénario</span>' : ''}
    </header>
    ${q.scenario ? `<div class="scenario">${q.scenario}</div>` : ''}
    <h2 class="q-stem" id="${name}-stem">${q.stem}</h2>
    <p class="hint">${esc(typeHint(q))}</p>`;

  const renderChoices = () => {
    const input = q.type === 'single' ? 'radio' : 'checkbox';
    const chosen = new Set(opts.initial ?? []);
    return `<fieldset class="options" aria-labelledby="${name}-stem">
      <legend class="sr-only">Réponses</legend>
      ${q.options
        .map(
          (o, i) => `<div class="option" data-opt="${esc(o.id)}">
            <input type="${input}" id="${name}-${esc(o.id)}" name="${name}" value="${esc(o.id)}" ${chosen.has(o.id) ? 'checked' : ''}>
            <label for="${name}-${esc(o.id)}"><span class="letter" aria-hidden="true">${LETTERS[i]}</span><span class="opt-text">${o.text}</span></label>
            <div class="why" hidden></div>
          </div>`,
        )
        .join('')}
    </fieldset>`;
  };

  const renderOrder = () => {
    const byId = new Map(q.options.map((o) => [o.id, o]));
    return `<ol class="order-list" aria-labelledby="${name}-stem">
      ${order
        .map(
          (id, i) => `<li class="order-item" data-opt="${esc(id)}">
            <span class="order-pos" aria-hidden="true">${i + 1}</span>
            <span class="opt-text">${byId.get(id)!.text}</span>
            <span class="order-btns">
              <button type="button" class="icon-btn" data-move="-1" aria-label="Monter l'étape ${i + 1}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="icon-btn" data-move="1" aria-label="Descendre l'étape ${i + 1}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
            </span>
          </li>`,
        )
        .join('')}
    </ol>`;
  };

  const body = document.createElement('div');
  body.className = 'q-body';
  el.innerHTML = header;
  el.append(body);
  const feedback = document.createElement('div');
  feedback.className = 'feedback';
  feedback.hidden = true;
  feedback.setAttribute('tabindex', '-1');
  el.append(feedback);

  const draw = () => {
    body.innerHTML = q.type === 'order' ? renderOrder() : renderChoices();
  };
  draw();

  const current = (): string[] => {
    if (q.type === 'order') return [...order];
    return [...body.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
  };

  const move = (id: string, delta: number) => {
    if (locked) return;
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    draw();
    const btn = body.querySelector<HTMLButtonElement>(`[data-opt="${CSS.escape(id)}"] [data-move="${delta}"]`);
    (btn && !btn.disabled ? btn : body.querySelector<HTMLButtonElement>(`[data-opt="${CSS.escape(id)}"] button:not([disabled])`))?.focus();
    announce(`Étape déplacée en position ${j + 1}`);
    opts.onChange?.(current());
  };

  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-move]');
    if (!b) return;
    const id = b.closest<HTMLElement>('[data-opt]')!.dataset.opt!;
    move(id, Number(b.dataset.move));
  });
  body.addEventListener('keydown', (e) => {
    if (q.type !== 'order' || !e.altKey) return;
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]');
    if (!li) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); move(li.dataset.opt!, -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(li.dataset.opt!, 1); }
  });
  body.addEventListener('change', () => opts.onChange?.(current()));

  const reveal = (): boolean => {
    locked = true;
    const ans = current();
    const ok = isCorrect(q, ans);
    if (q.type === 'order') {
      const expected = q.correctOrder ?? q.options.map((o) => o.id);
      for (const btn of body.querySelectorAll<HTMLButtonElement>('button')) btn.disabled = true;
      body.querySelectorAll<HTMLElement>('[data-opt]').forEach((li, i) => li.classList.add(expected[i] === li.dataset.opt ? 'is-right' : 'is-wrong'));
      const byId = new Map(q.options.map((o) => [o.id, o]));
      feedback.innerHTML = `${verdict(ok)}
        <h3>Ordre attendu</h3>
        <ol class="order-solution">${expected.map((id) => `<li><strong>${byId.get(id)!.text}</strong>${byId.get(id)!.why ? `<p>${byId.get(id)!.why}</p>` : ''}</li>`).join('')}</ol>
        ${explanation(q)}`;
    } else {
      const chosen = new Set(ans);
      for (const input of body.querySelectorAll<HTMLInputElement>('input')) input.disabled = true;
      for (const o of q.options) {
        const row = body.querySelector<HTMLElement>(`[data-opt="${CSS.escape(o.id)}"]`)!;
        row.classList.add(o.correct ? 'is-right' : chosen.has(o.id) ? 'is-wrong' : 'is-neutral');
        if (chosen.has(o.id)) row.classList.add('was-chosen');
        const why = row.querySelector<HTMLElement>('.why')!;
        why.hidden = false;
        why.innerHTML = `<strong>${o.correct ? 'Bonne réponse' : 'Mauvaise réponse'}${chosen.has(o.id) ? ' (votre choix)' : ''}.</strong> ${o.why}`;
      }
      feedback.innerHTML = `${verdict(ok)}${explanation(q)}`;
    }
    feedback.hidden = false;
    announce(ok ? 'Bonne réponse' : 'Réponse incorrecte');
    return ok;
  };

  return {
    el,
    answer: current,
    hasAnswer: () => current().length > 0,
    reveal,
    focusFirst: () => body.querySelector<HTMLElement>('input, button')?.focus(),
    key(e) {
      if (locked || q.type === 'order' || e.altKey || e.ctrlKey || e.metaKey) return false;
      const target = e.target as HTMLElement;
      if (target.matches('textarea, input[type=text], input[type=search], input[type=date], input[type=number]')) return false;
      const n = Number(e.key);
      const letter = LETTERS.indexOf(e.key.toUpperCase());
      const idx = n >= 1 && n <= q.options.length ? n - 1 : letter >= 0 && letter < q.options.length && e.key.length === 1 ? letter : -1;
      if (idx < 0) return false;
      const input = body.querySelectorAll<HTMLInputElement>('input')[idx];
      if (q.type === 'single') input.checked = true;
      else input.checked = !input.checked;
      input.focus();
      opts.onChange?.(current());
      return true;
    },
  };
}

function verdict(ok: boolean): string {
  return `<p class="verdict ${ok ? 'verdict-ok' : 'verdict-ko'}">${ok ? '✓ Bonne réponse' : '✗ Réponse incorrecte'}</p>`;
}

export function explanation(q: Question): string {
  const sources = q.sources.map((u) => `<li><a class="ext" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace('https://learn.microsoft.com/en-us/', ''))}</a></li>`).join('');
  return `<div class="explanation">
    <h3>Explication</h3>
    ${q.explanation}
    <p><a href="${lessonHref(q.lesson)}">Revoir la leçon ${esc(q.lesson.split('#')[0])}</a></p>
    ${sources ? `<details><summary>Sources Microsoft Learn</summary><ul>${sources}</ul></details>` : ''}
  </div>`;
}
