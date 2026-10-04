import { store } from './app';

/** Applique le thème choisi (auto suit le système). */
export function applyTheme(): void {
  const pref = store.state.prefs.theme;
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function watchSystemTheme(): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.state.prefs.theme === 'auto') applyTheme();
  });
}
