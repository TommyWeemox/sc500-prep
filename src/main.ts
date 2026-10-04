import './styles.css';
import { esc } from './lib/dom';
import { Router, type Route } from './lib/router';
import { applyTheme, watchSystemTheme } from './theme';
import { dashboardView } from './views/dashboard';
import { diagnosticView } from './views/diagnostic';
import { examHomeView, examResultView, examRunView } from './views/exam';
import { flashcardsView } from './views/flashcards';
import { journalView } from './views/journal';
import { labView, labsView } from './views/labs';
import { lessonView, lessonsIndexView } from './views/lessons';
import { pathView } from './views/path';
import { quizRunView, quizSetupView } from './views/quiz';
import { caseView, casesView, sheetView, sheetsView } from './views/resources';
import { searchView } from './views/search';
import { settingsView } from './views/settings';

applyTheme();
watchSystemTheme();

const router = new Router()
  .on('/', dashboardView)
  .on('/parcours', pathView)
  .on('/diagnostic', diagnosticView)
  .on('/cours', lessonsIndexView)
  .on('/cours/:id', lessonView)
  .on('/quiz', quizSetupView)
  .on('/quiz/run', quizRunView)
  .on('/examen', examHomeView)
  .on('/examen/run', examRunView)
  .on('/examen/resultat/:id', examResultView)
  .on('/flashcards', flashcardsView)
  .on('/labs', labsView)
  .on('/labs/:id', labView)
  .on('/etude-de-cas', casesView)
  .on('/etude-de-cas/:id', caseView)
  .on('/fiches', sheetsView)
  .on('/fiches/:domain', sheetView)
  .on('/journal', journalView)
  .on('/recherche', searchView)
  .on('/parametres', settingsView)
  .fallback((_r: Route, main: HTMLElement) => {
    main.innerHTML = '<h1 tabindex="-1">Page introuvable</h1><p><a href="#/">Retour au tableau de bord</a></p>';
  });

const main = document.getElementById('main')!;
const nav = document.getElementById('nav')!;
const menuBtn = document.getElementById('menu-btn')!;
let lastPath = '';
let renderSeq = 0;

function setActiveNav(path: string): void {
  for (const a of nav.querySelectorAll<HTMLAnchorElement>('a')) {
    const target = a.getAttribute('href')!.slice(1);
    const active = target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

async function render(): Promise<void> {
  const seq = ++renderSeq;
  const { view, route } = router.resolve(location.hash);
  // Chaque rendu reçoit un conteneur neuf : les écouteurs de la page précédente disparaissent avec lui.
  const container = document.createElement('div');
  container.className = 'view';
  main.replaceChildren(container);
  main.setAttribute('aria-busy', 'true');
  setActiveNav(route.path);
  document.body.classList.remove('menu-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  try {
    await view(route, container);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<h1 tabindex="-1">Erreur</h1><p>${esc((e as Error).message)}</p><p><a href="#/">Retour au tableau de bord</a></p>`;
  }
  if (seq !== renderSeq) return;
  main.removeAttribute('aria-busy');
  const h1 = container.querySelector('h1');
  document.title = `${h1?.textContent?.trim() ?? 'SC-500'} · SC-500 Prep`;
  const samePage = route.path === lastPath;
  lastPath = route.path;
  if (route.anchor) {
    const el = document.getElementById(route.anchor);
    if (el) {
      el.scrollIntoView();
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      return;
    }
  }
  if (!samePage) window.scrollTo(0, 0);
  if (h1) {
    h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }
}

window.addEventListener('hashchange', () => void render());
menuBtn.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', String(open));
});

const searchForm = document.getElementById('top-search') as HTMLFormElement;
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = (searchForm.elements.namedItem('q') as HTMLInputElement).value.trim();
  if (q) location.hash = `#/recherche?q=${encodeURIComponent(q)}`;
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !(e.target as HTMLElement).matches('input, textarea, select')) {
    e.preventDefault();
    (searchForm.elements.namedItem('q') as HTMLInputElement).focus();
  }
});

// Avertit en cas de stockage indisponible (navigation privée stricte).
try {
  localStorage.setItem('sc500-prep:probe', '1');
  localStorage.removeItem('sc500-prep:probe');
} catch {
  document.getElementById('storage-warning')!.hidden = false;
}

void render();
