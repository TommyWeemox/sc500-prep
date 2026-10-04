// Paramètres : thème, export et import de la progression, réinitialisation.
import { getCtx, store } from '../app';
import { data } from '../lib/data';
import { download, esc, formatDate } from '../lib/dom';
import type { Route } from '../lib/router';
import { applyTheme } from '../theme';

export async function settingsView(_route: Route, main: HTMLElement): Promise<void> {
  const ctx = await getCtx();
  const certs = await data.certs();
  const cs = store.cert(ctx.cert);
  const prefs = store.state.prefs;
  const size = new Blob([store.exportJson()]).size;
  main.innerHTML = `
    <h1 tabindex="-1">Paramètres</h1>
    <section class="card">
      <h2>Affichage</h2>
      <fieldset class="radios"><legend>Thème</legend>
        ${(['auto', 'light', 'dark'] as const).map((t) => `<label class="check"><input type="radio" name="theme" value="${t}" ${prefs.theme === t ? 'checked' : ''}> ${t === 'auto' ? 'Selon le système' : t === 'light' ? 'Clair' : 'Sombre'}</label>`).join('')}
      </fieldset>
      ${certs.length > 1 ? `<label>Certification <select name="cert">${certs.map((c) => `<option value="${c.id}" ${c.id === prefs.cert ? 'selected' : ''}>${esc(c.code)} · ${esc(c.title)}</option>`).join('')}</select></label>` : ''}
      <label>Nouvelles flashcards par jour <input type="number" name="newCards" min="0" max="200" value="${cs.settings.newCardsPerDay}"></label>
    </section>
    <section class="card">
      <h2>Progression</h2>
      <p>Votre progression reste dans ce navigateur (${(size / 1024).toFixed(1)} Ko). Exportez-la régulièrement pour la sauvegarder ou la transférer sur un autre appareil.</p>
      <p class="actions">
        <button type="button" class="btn primary" data-act="export">Exporter (JSON)</button>
        <label class="btn" for="import-file">Importer un export</label>
        <input type="file" id="import-file" accept="application/json,.json" class="sr-only">
      </p>
      <p id="import-msg" role="status"></p>
      <h3>Zone sensible</h3>
      <button type="button" class="btn danger" data-act="reset">Tout réinitialiser</button>
    </section>
    <section class="card">
      <h2>À propos du contenu</h2>
      <p>Contenu construit à partir du <a class="ext" href="${esc(ctx.catalog.source.url)}" target="_blank" rel="noopener noreferrer">guide d'étude officiel ${esc(ctx.catalog.cert.code)}</a> (version Microsoft du ${formatDate(ctx.catalog.source.msDate)}, récupérée le ${formatDate(ctx.catalog.source.retrieved)}). ${ctx.catalog.counts.lessons} leçons, ${ctx.catalog.counts.questions} questions d'entraînement, ${ctx.catalog.counts.examQuestions} questions d'examen blanc, ${ctx.catalog.counts.flashcards} flashcards, ${ctx.catalog.counts.labs} labs.</p>
      <p>Aucune question réelle d'examen. Les points marqués <mark class="verify">à vérifier</mark> n'ont pas pu être confirmés sur Microsoft Learn au moment de la rédaction.</p>
      <ul class="plain">${ctx.catalog.cert.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </section>`;

  main.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'theme') {
      store.setPrefs({ theme: t.value as 'auto' | 'light' | 'dark' });
      applyTheme();
    }
    if (t.name === 'cert') {
      store.setPrefs({ cert: t.value });
      location.hash = '#/';
      location.reload();
    }
    if (t.name === 'newCards') store.updateSettings({ newCardsPerDay: Math.max(0, Number(t.value) || 0) }, ctx.cert);
    if (t.id === 'import-file' && t.files?.[0]) {
      const msg = main.querySelector('#import-msg')!;
      try {
        const text = await t.files[0].text();
        if (!window.confirm('Importer remplace toute la progression actuelle de ce navigateur. Continuer ?')) return;
        store.importJson(text);
        msg.textContent = 'Import réussi.';
        applyTheme();
      } catch (err) {
        msg.textContent = `Import impossible : ${(err as Error).message}`;
      } finally {
        t.value = '';
      }
    }
  });
  main.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'export') download(`sc500-prep-progression-${store.today()}.json`, store.exportJson());
    if (act === 'reset' && window.confirm('Effacer toute la progression (leçons, réponses, flashcards, examens) ? Pensez à exporter avant.')) {
      store.reset();
      location.hash = '#/';
    }
  });
}
