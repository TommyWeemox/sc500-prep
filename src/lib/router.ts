// Routeur par hash (#/cours/1.1#ancre), compatible GitHub Pages sans réécriture d'URL.

export interface Route {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  anchor: string;
}

export type View = (route: Route, main: HTMLElement) => Promise<void> | void;

interface Entry { pattern: RegExp; keys: string[]; view: View }

export function parseHash(hash: string): Omit<Route, 'params'> {
  const h = hash.replace(/^#/, '') || '/';
  const anchorIdx = h.indexOf('#');
  const beforeAnchor = anchorIdx >= 0 ? h.slice(0, anchorIdx) : h;
  const anchor = anchorIdx >= 0 ? decodeURIComponent(h.slice(anchorIdx + 1)) : '';
  const [path, qs = ''] = beforeAnchor.split('?');
  return { path: path || '/', query: new URLSearchParams(qs), anchor };
}

export class Router {
  private entries: Entry[] = [];
  private notFound: View = () => {};

  on(pattern: string, view: View): this {
    const keys: string[] = [];
    const re = pattern.replace(/:([a-zA-Z]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.entries.push({ pattern: new RegExp(`^${re}/?$`), keys, view });
    return this;
  }

  fallback(view: View): this {
    this.notFound = view;
    return this;
  }

  resolve(hash: string): { view: View; route: Route } {
    const base = parseHash(hash);
    for (const e of this.entries) {
      const m = base.path.match(e.pattern);
      if (m) {
        const params = Object.fromEntries(e.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return { view: e.view, route: { ...base, params } };
      }
    }
    return { view: this.notFound, route: { ...base, params: {} } };
  }
}

export function go(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
