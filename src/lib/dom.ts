// Petits utilitaires DOM. Le HTML de contenu vient du build (de confiance) ;
// tout texte saisi par l'utilisateur passe par esc().

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function $(sel: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(sel);
}

export function $$(sel: string, root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(sel)];
}

export function stripTags(html: string): string {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
}

/** Annonce un message aux lecteurs d'écran. */
export function announce(msg: string): void {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => (live.textContent = msg), 30);
}

export function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function progressBar(value: number, label: string): string {
  const v = Math.max(0, Math.min(1, value));
  const tone = v >= 0.85 ? 'ok' : v >= 0.7 ? 'good' : v >= 0.45 ? 'mid' : 'low';
  return `<div class="bar bar-${tone}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v * 100)}"><span style="width:${(v * 100).toFixed(1)}%"></span></div>`;
}

export function download(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Active les boutons « Copier » et rend les schémas Mermaid (chargés seulement si présents). */
export async function enhance(root: HTMLElement): Promise<void> {
  for (const btn of $$('[data-copy]', root)) {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code')?.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copié';
      } catch {
        btn.textContent = 'Copie impossible';
      }
      window.setTimeout(() => (btn.textContent = 'Copier'), 1500);
    });
  }
  const diagrams = $$('pre.mermaid', root);
  if (!diagrams.length) return;
  try {
    const { default: mermaid } = await import('mermaid');
    const dark = document.documentElement.dataset.theme === 'dark';
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
    await mermaid.run({ nodes: diagrams });
  } catch (e) {
    console.error(e);
    for (const d of diagrams) d.classList.add('mermaid-error');
  }
}
