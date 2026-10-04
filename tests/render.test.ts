import { describe, expect, it } from 'vitest';
import { createRenderer, slugify, splitSections } from '../scripts/lib/render.mjs';
import { parseHash } from '../src/lib/router';

describe('rendu Markdown du build', () => {
  it('transforme les encadrés, ancres, Mermaid, code et « à vérifier »', () => {
    const r = createRenderer();
    const html = r.block([
      '## Configurer PIM {#s-1-1-1}',
      '',
      '> [!PIEGE] Un rôle **éligible** n\'est pas actif.',
      '',
      '```mermaid',
      'flowchart LR; A-->B',
      '```',
      '',
      '```azurecli',
      'az group create -n rg -l westeurope',
      '```',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      'Limite de 30 jours (à vérifier).',
      '',
      '[Doc](https://learn.microsoft.com/en-us/entra/)',
    ].join('\n'));
    expect(html).toContain('<h2 id="s-1-1-1">Configurer PIM</h2>');
    expect(html).toContain('callout-trap');
    expect(html).toContain('<strong>éligible</strong>');
    expect(html).toContain('<pre class="mermaid">flowchart LR; A--&gt;B</pre>');
    expect(html).toContain('Azure CLI');
    expect(html).toContain('<div class="table-wrap"');
    expect(html).toContain('<mark class="verify"');
    expect(html).toContain('target="_blank"');
    expect(r.headings[0]).toEqual({ id: 's-1-1-1', depth: 2, text: 'Configurer PIM' });
  });

  it('slugify et découpage en sections', () => {
    expect(slugify('Accès conditionnel : les bases')).toBe('acces-conditionnel-les-bases');
    const s = splitSections('intro\n## Un {#u}\ntexte un\n## Deux\ntexte deux');
    expect(s.map((x: { id: string }) => x.id)).toEqual(['', 'u', 'deux']);
  });
});

describe('routeur', () => {
  it('sépare chemin, paramètres et ancre', () => {
    const r = parseHash('#/cours/1.1#s-1-1-2');
    expect(r.path).toBe('/cours/1.1');
    expect(r.anchor).toBe('s-1-1-2');
    const q = parseHash('#/quiz/run?mode=objective&objective=1.1');
    expect(q.path).toBe('/quiz/run');
    expect(q.query.get('objective')).toBe('1.1');
  });
});
