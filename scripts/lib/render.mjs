// Rendu Markdown -> HTML au moment du build. Le navigateur ne reçoit que du HTML.
import { Marked } from 'marked';

export const CALLOUTS = {
  PIEGE: { cls: 'trap', title: 'Piège' },
  EXAMEN: { cls: 'exam', title: "À retenir pour l'examen" },
  TERRAIN: { cls: 'field', title: 'Dans la vraie vie' },
  INFO: { cls: 'info', title: 'À noter' },
  ATTENTION: { cls: 'warn', title: 'Attention' },
};

const CODE_LABELS = {
  azurecli: 'Azure CLI',
  bash: 'Bash',
  powershell: 'PowerShell',
  bicep: 'Bicep',
  json: 'JSON',
  kusto: 'KQL',
  kql: 'KQL',
  yaml: 'YAML',
  xml: 'XML (policy APIM)',
  text: 'Texte',
  portal: 'Portail Azure',
};

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
}

const VERIFY_RE = /\(à vérifier\)/g;
const markVerify = (html) => html.replace(VERIFY_RE, '<mark class="verify" title="Point non confirmé par Microsoft Learn au moment de la rédaction">à vérifier</mark>');

/** Crée un moteur de rendu ; `headings` collecte la table des matières. */
export function createRenderer() {
  const headings = [];
  const usedIds = new Set();
  const uniqueId = (base) => {
    let id = base || 'section';
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        let explicit = null;
        const m = text.match(/\s*\{#([a-z0-9-]+)\}\s*$/);
        if (m) {
          explicit = m[1];
          const last = tokens[tokens.length - 1];
          if (last && typeof last.text === 'string') {
            last.text = last.text.replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
            if (typeof last.raw === 'string') last.raw = last.raw.replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
          }
        }
        const inner = this.parser.parseInline(tokens);
        const plain = decodeEntities(inner.replace(/<[^>]+>/g, ''));
        const id = uniqueId(explicit ?? slugify(plain));
        if (depth <= 3) headings.push({ id, depth, text: plain });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (l === 'mermaid') {
          return `<figure class="diagram"><pre class="mermaid">${escapeHtml(text)}</pre></figure>\n`;
        }
        const label = CODE_LABELS[l] ?? (l ? l : 'Code');
        return `<div class="code"><div class="code-head"><span>${escapeHtml(label)}</span><button type="button" class="copy" data-copy>Copier</button></div><pre><code class="lang-${escapeHtml(l || 'text')}">${escapeHtml(text)}</code></pre></div>\n`;
      },
      blockquote({ tokens }) {
        const inner = this.parser.parse(tokens);
        const m = inner.match(/^<p>\[!([A-Z]+)\]\s*/);
        if (m && CALLOUTS[m[1]]) {
          const c = CALLOUTS[m[1]];
          const body = inner.replace(/^<p>\[![A-Z]+\]\s*/, '<p>').replace(/^<p>\s*<\/p>\n?/, '');
          return `<aside class="callout callout-${c.cls}" role="note"><p class="callout-title">${c.title}</p>${body}</aside>\n`;
        }
        return `<blockquote>${inner}</blockquote>\n`;
      },
      table(token) {
        const header = token.header.map((c) => `<th scope="col"${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('\n');
        return `<div class="table-wrap" tabindex="0"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        if (/^https?:\/\//.test(href)) {
          return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener noreferrer" class="ext">${text}</a>`;
        }
        return `<a href="${escapeHtml(href)}"${t}>${text}</a>`;
      },
    },
  });

  return {
    headings,
    block: (md) => markVerify(marked.parse(md ?? '')),
    inline: (md) => markVerify(marked.parseInline(String(md ?? ''))),
  };
}

/** Texte brut pour l'index de recherche. */
export function toPlainText(md) {
  return String(md ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\{#[a-z0-9-]+\}/g, '')
    .replace(/^>\s*\[![A-Z]+\]/gm, '')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Découpe un document Markdown en sections de niveau 2 (pour la recherche). */
export function splitSections(md) {
  const out = [];
  let current = { title: '', id: '', body: [] };
  const used = new Set();
  for (const line of String(md).split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*(?:\{#([a-z0-9-]+)\})?\s*$/);
    if (m) {
      if (current.body.length || current.title) out.push(current);
      let id = m[2] ?? slugify(m[1]);
      let n = 2;
      const base = id;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      current = { title: m[1], id, body: [] };
    } else {
      current.body.push(line);
    }
  }
  out.push(current);
  return out.map((s) => ({ ...s, text: toPlainText(s.body.join('\n')) })).filter((s) => s.text);
}
