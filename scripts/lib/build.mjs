// Compile content/<cert>/ en JSON statiques dans public/data/<cert>/.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listCerts, loadCert, indexObjectives } from './content.mjs';
import { createRenderer, splitSections, toPlainText } from './render.mjs';

export const OUT_DIR = path.join(ROOT, 'public', 'data');

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

function renderQuestion(q) {
  const r = createRenderer();
  const out = {
    id: q.id,
    objective: q.objective,
    skills: q.skills ?? [],
    type: q.type,
    pool: q.pool,
    scenario: q.scenario ? r.block(q.scenario) : null,
    stem: r.inline(q.stem),
    options: q.options.map((o) => ({ id: o.id, text: r.inline(o.text), correct: Boolean(o.correct), why: r.inline(o.why ?? '') })),
    explanation: r.block(q.explanation ?? ''),
    lesson: q.lesson ?? q.objective,
    sources: q.sources ?? [],
    diagnostic: Boolean(q.diagnostic),
    difficulty: q.difficulty ?? 2,
  };
  if (q.type === 'order') out.correctOrder = q.options.map((o) => o.id);
  return out;
}

function renderCard(c) {
  const r = createRenderer();
  return { id: c.id, objective: c.objective, skills: c.skills ?? [], front: r.inline(c.front), back: r.block(c.back), source: c.source ?? null };
}

function renderDoc(doc) {
  const r = createRenderer();
  const html = r.block(doc.body);
  return { html, toc: r.headings.filter((h) => h.depth === 2), renderer: r };
}

export function buildCert(certId) {
  const cert = loadCert(certId);
  const out = path.join(OUT_DIR, certId);
  fs.rmSync(out, { recursive: true, force: true });
  const { objectiveToDomain } = indexObjectives(cert.objectives);
  const search = [];

  // Leçons
  const lessonsMeta = [];
  for (const doc of cert.lessons) {
    const m = doc.meta;
    const { html, toc, renderer: r } = renderDoc(doc);
    const lesson = {
      objective: String(m.objective),
      title: m.title,
      minutes: m.minutes ?? 60,
      verified: String(m.verified ?? ''),
      summary: r.inline(m.summary ?? ''),
      preQuestions: (m.preQuestions ?? []).map((q) => r.inline(q)),
      recall: (m.recall ?? []).map((x) => ({ q: r.inline(x.q), a: r.block(x.a) })),
      feynman: m.feynman ? { prompt: r.inline(m.feynman.prompt), model: r.block(m.feynman.model) } : null,
      sources: m.sources ?? [],
      html,
      toc,
    };
    writeJson(path.join(out, 'lessons', `${lesson.objective}.json`), lesson);
    lessonsMeta.push({ objective: lesson.objective, title: lesson.title, minutes: lesson.minutes, verified: lesson.verified, summary: lesson.summary });
    for (const s of splitSections(doc.body)) {
      search.push({ id: `lesson:${lesson.objective}:${s.id}`, kind: 'Leçon', title: s.title ? `${lesson.objective} · ${s.title}` : lesson.title, text: s.text, route: `#/cours/${lesson.objective}${s.id ? '#' + s.id : ''}`, objective: lesson.objective });
    }
  }

  // Labs
  const labsMeta = [];
  for (const doc of cert.labs) {
    const m = doc.meta;
    const { html, toc } = renderDoc(doc);
    const lab = { id: m.id, title: m.title, domain: m.domain, objectives: (m.objectives ?? []).map(String), skills: (m.skills ?? []).map(String), duration: m.duration, cost: m.cost, level: m.level ?? 'Intermédiaire', thread: Boolean(m.thread), summary: m.summary ?? '', sources: m.sources ?? [], html, toc };
    writeJson(path.join(out, 'labs', `${lab.id}.json`), lab);
    const { html: _h, toc: _t, ...meta } = lab;
    labsMeta.push(meta);
    search.push({ id: `lab:${lab.id}`, kind: 'Lab', title: lab.title, text: toPlainText(doc.body), route: `#/labs/${lab.id}`, objective: lab.objectives[0] ?? '' });
  }

  // Fiches de synthèse
  const sheetsMeta = [];
  for (const doc of cert.sheets) {
    const m = doc.meta;
    const { html } = renderDoc(doc);
    writeJson(path.join(out, 'sheets', `${m.domain}.json`), { domain: m.domain, title: m.title, verified: String(m.verified ?? ''), sources: m.sources ?? [], html });
    sheetsMeta.push({ domain: m.domain, title: m.title });
    search.push({ id: `sheet:${m.domain}`, kind: 'Fiche', title: m.title, text: toPlainText(doc.body), route: `#/fiches/${m.domain}`, objective: '' });
  }

  // Études de cas
  const casesMeta = [];
  for (const doc of cert.caseStudies) {
    const m = doc.meta;
    const parts = doc.body.split(/^<!--\s*corrige\s*-->\s*$/m);
    const r = createRenderer();
    const statement = r.block(parts[0]);
    const answer = r.block(parts[1] ?? '');
    writeJson(path.join(out, 'case-studies', `${m.id}.json`), { id: m.id, title: m.title, summary: m.summary ?? '', objectives: (m.objectives ?? []).map(String), sources: m.sources ?? [], statement, answer, toc: r.headings.filter((h) => h.depth === 2) });
    casesMeta.push({ id: m.id, title: m.title, summary: m.summary ?? '' });
    search.push({ id: `case:${m.id}`, kind: 'Étude de cas', title: m.title, text: toPlainText(parts[0]), route: `#/etude-de-cas/${m.id}`, objective: '' });
  }

  // Questions et flashcards
  const questions = cert.questions.map(renderQuestion);
  writeJson(path.join(out, 'questions.json'), questions);
  for (const q of cert.questions.filter((x) => x.pool === 'practice')) {
    search.push({ id: `q:${q.id}`, kind: 'Question', title: `${q.objective} · ${toPlainText(q.stem).slice(0, 90)}`, text: toPlainText(`${q.scenario ?? ''} ${q.stem} ${q.explanation ?? ''}`), route: `#/quiz/run?mode=question&id=${encodeURIComponent(q.id)}`, objective: q.objective });
  }
  const cards = cert.flashcards.map(renderCard);
  writeJson(path.join(out, 'flashcards.json'), cards);
  for (const c of cert.flashcards) {
    search.push({ id: `card:${c.id}`, kind: 'Flashcard', title: `${c.objective} · ${toPlainText(c.front).slice(0, 90)}`, text: toPlainText(`${c.front} ${c.back}`), route: `#/flashcards?card=${encodeURIComponent(c.id)}`, objective: c.objective });
  }

  const exams = cert.exams.map((e) => ({ id: e.id, title: e.title, durationMinutes: e.durationMinutes, count: e.questions.length, description: e.description ?? '' }));

  const o = cert.objectives;
  const catalog = {
    cert: o.cert,
    source: o.source,
    domains: o.domains,
    path: cert.studyPath,
    lessons: lessonsMeta.sort((a, b) => a.objective.localeCompare(b.objective, 'fr', { numeric: true })),
    labs: labsMeta,
    sheets: sheetsMeta,
    caseStudies: casesMeta,
    exams,
    counts: {
      lessons: lessonsMeta.length,
      questions: questions.filter((q) => q.pool === 'practice').length,
      examQuestions: questions.filter((q) => q.pool !== 'practice').length,
      flashcards: cards.length,
      labs: labsMeta.length,
    },
    builtAt: new Date().toISOString(),
  };
  // Vérifie que chaque question pointe vers un domaine connu (la validation complète est ailleurs).
  for (const q of questions) if (!objectiveToDomain.has(q.objective)) throw new Error(`Question ${q.id} : objectif inconnu ${q.objective}`);
  writeJson(path.join(out, 'catalog.json'), catalog);
  writeJson(path.join(out, 'search.json'), search);
  return catalog;
}

export function buildAll() {
  const certs = listCerts();
  const list = [];
  for (const id of certs) {
    const c = buildCert(id);
    list.push({ id, code: c.cert.code, title: c.cert.title, counts: c.counts });
  }
  writeJson(path.join(OUT_DIR, 'certs.json'), list);
  return list;
}
