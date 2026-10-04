#!/usr/bin/env node
// Valide le contenu de chaque certification. Code de sortie 1 en cas d'erreur.
// Options : --strict (les avertissements deviennent des erreurs), --cert=<id>.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CONTENT_DIR, listCerts, loadCert, indexObjectives } from './lib/content.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.find((a) => a.startsWith('--cert='))?.split('=')[1];

const QUOTAS = { questionsPerObjective: 10, flashcardsPerObjective: 8, labsPerDomain: 2, diagnosticPerObjective: 2, minLessonSources: 3 };
const LESSON_CALLOUTS = ['PIEGE', 'EXAMEN', 'TERRAIN'];
const LAB_SECTIONS = ['Objectif', 'Prérequis', 'Étapes', 'Vérification', 'Défi', 'Nettoyage'];
const LEARN = /^https:\/\/learn\.microsoft\.com\//;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

let errors = 0;
let warnings = 0;
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const err = (where, msg) => { errors++; console.error(`ERREUR  ${where} : ${msg}`); };
const warn = (where, msg) => { warnings++; console.warn(`ATTENTION ${where} : ${msg}`); };

function checkSources(where, sources, min = 1) {
  if (!Array.isArray(sources) || sources.length < min) return err(where, `au moins ${min} source(s) Microsoft Learn requise(s)`);
  for (const s of sources) {
    const url = typeof s === 'string' ? s : s?.url;
    if (!url) err(where, 'source sans URL');
    else if (!LEARN.test(url)) err(where, `source hors Microsoft Learn : ${url}`);
    if (typeof s === 'object' && !s.title) err(where, `source sans titre : ${url}`);
  }
}

function scanText(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('—')) err(rel(file), 'tiret cadratin (—) interdit par la charte de style');
  if (/AccountKey=[A-Za-z0-9+/=]{20,}|SharedAccessSignature=|sig=[A-Za-z0-9%]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(text)) {
    err(rel(file), 'ressemble à un secret (clé, SAS, jeton) : à retirer');
  }
}

function validateCert(certId) {
  const cert = loadCert(certId);
  const o = cert.objectives;
  const { objectiveToDomain, skillToObjective, objectiveById } = indexObjectives(o);
  const where = `${certId}/objectives.json`;

  // Objectifs
  const seen = new Set();
  let wMin = 0;
  let wMax = 0;
  for (const d of o.domains) {
    if (!d.weight || d.weight.min > d.weight.max) err(where, `pondération invalide pour ${d.id}`);
    wMin += d.weight.min;
    wMax += d.weight.max;
    for (const ob of d.objectives) {
      if (seen.has(ob.id)) err(where, `objectif en double ${ob.id}`);
      seen.add(ob.id);
      if (!ob.learningPath?.url) err(where, `parcours manquant pour ${ob.id}`);
      for (const s of ob.skills) {
        if (!s.id.startsWith(`${ob.id}.`)) err(where, `sous-objectif ${s.id} mal numéroté`);
        if (!s.docs?.length) err(where, `sous-objectif ${s.id} sans page de référence`);
        for (const u of s.docs ?? []) if (!LEARN.test(u)) err(where, `référence hors Learn pour ${s.id}`);
      }
    }
  }
  if (wMin > 100 || wMax < 100) err(where, `les pondérations (${wMin}-${wMax} %) n'encadrent pas 100 %`);

  // Leçons
  const lessonByObjective = new Map();
  for (const doc of cert.lessons) {
    const m = doc.meta;
    const w = rel(doc.file);
    scanText(doc.file);
    const id = String(m.objective ?? '');
    if (!objectiveById.has(id)) { err(w, `objectif inconnu "${id}"`); continue; }
    if (lessonByObjective.has(id)) err(w, `deuxième leçon pour l'objectif ${id}`);
    lessonByObjective.set(id, doc);
    if (!m.title) err(w, 'titre manquant');
    if (!DATE.test(String(m.verified ?? ''))) err(w, 'date de vérification (verified: AAAA-MM-JJ) manquante');
    checkSources(w, m.sources, QUOTAS.minLessonSources);
    const pre = m.preQuestions ?? [];
    if (pre.length < 2 || pre.length > 3) err(w, `2 ou 3 questions avant lecture attendues (trouvé ${pre.length})`);
    if ((m.recall ?? []).length < 3) err(w, 'au moins 3 questions de rappel sans aide attendues');
    for (const r of m.recall ?? []) if (!r.q || !r.a) err(w, 'rappel incomplet (q et a requis)');
    if (!m.feynman?.prompt || !m.feynman?.model) err(w, 'exercice Feynman (prompt + model) manquant');
    else if (m.feynman.model.trim().split(/\r?\n/).filter(Boolean).length > 6) warn(w, 'réponse modèle Feynman de plus de 5 lignes');
    for (const c of LESSON_CALLOUTS) if (!doc.body.includes(`[!${c}]`)) err(w, `encadré [!${c}] manquant`);
    if (!/```mermaid/.test(doc.body)) err(w, 'aucun schéma Mermaid');
    if (!/^\|.*\|\s*$/m.test(doc.body)) err(w, 'aucun tableau comparatif');
    const langs = new Set([...doc.body.matchAll(/```(azurecli|powershell|bicep|kusto|json|bash|xml|yaml)/g)].map((x) => x[1]));
    if (langs.size === 0) err(w, 'aucun exemple de code (Azure CLI, PowerShell, Bicep, KQL...)');
    else if (langs.size < 2) warn(w, `un seul langage d'exemple (${[...langs].join(', ')})`);
    if (!/portail|portal/i.test(doc.body)) warn(w, 'pas de chemin dans le portail mentionné');
    const ownSkills = objectiveById.get(id).skills.map((s) => s.id);
    for (const s of ownSkills) if (!doc.body.includes(`{#s-${s.replace(/\./g, '-')}}`)) warn(w, `pas de section ancrée {#s-${s.replace(/\./g, '-')}} pour le sous-objectif ${s}`);
  }
  for (const id of objectiveById.keys()) if (!lessonByObjective.has(id)) err(certId, `aucune leçon pour l'objectif ${id}`);

  // Questions
  const ids = new Set();
  const perObjective = new Map();
  const skillCovered = new Set();
  for (const f of new Set(cert.questions.map((q) => q._file))) scanText(f);
  for (const q of cert.questions) {
    const w = `${rel(q._file)}#${q.id}`;
    if (!q.id) { err(rel(q._file), 'question sans id'); continue; }
    if (ids.has(q.id)) err(w, 'id en double');
    ids.add(q.id);
    if (!objectiveById.has(String(q.objective))) { err(w, `objectif inconnu ${q.objective}`); continue; }
    for (const s of q.skills ?? []) {
      if (skillToObjective.get(s) !== q.objective) err(w, `sous-objectif ${s} n'appartient pas à ${q.objective}`);
      else skillCovered.add(s);
    }
    if (!q.skills?.length) err(w, 'aucun sous-objectif (skills) rattaché');
    if (!['single', 'multiple', 'order'].includes(q.type)) err(w, `type inconnu ${q.type}`);
    if (!q.stem) err(w, 'énoncé manquant');
    if (!q.explanation) err(w, 'explication manquante');
    checkSources(w, q.sources);
    const opts = q.options ?? [];
    const optIds = new Set(opts.map((x) => x.id));
    if (optIds.size !== opts.length) err(w, 'ids d\'options en double');
    for (const x of opts) if (!x.text) err(w, `option ${x.id} sans texte`);
    const nCorrect = opts.filter((x) => x.correct).length;
    if (q.type === 'single') {
      if (opts.length < 3) err(w, 'au moins 3 options attendues');
      if (nCorrect !== 1) err(w, `choix unique : ${nCorrect} bonne(s) réponse(s)`);
    }
    if (q.type === 'multiple') {
      if (opts.length < 4) err(w, 'au moins 4 options attendues');
      if (nCorrect < 2) err(w, 'choix multiple : au moins 2 bonnes réponses');
      if (!/\b(deux|trois|quatre|\d)\b/i.test(q.stem)) warn(w, 'choix multiple : préciser le nombre de réponses attendues dans l\'énoncé');
    }
    if (q.type === 'order' && opts.length < 3) err(w, 'ordre : au moins 3 étapes');
    if (q.type !== 'order') for (const x of opts) if (!x.why) err(w, `option ${x.id} sans justification (why)`);
    if (q.lesson && !String(q.lesson).startsWith(String(q.objective))) warn(w, `lien de leçon ${q.lesson} hors de l'objectif`);
    if (q.pool === 'practice') {
      const st = perObjective.get(q.objective) ?? { total: 0, scenario: 0, diag: 0, types: new Set() };
      st.total++;
      if (q.scenario) st.scenario++;
      if (q.diagnostic) st.diag++;
      st.types.add(q.type);
      perObjective.set(q.objective, st);
    }
  }
  for (const id of objectiveById.keys()) {
    const st = perObjective.get(id) ?? { total: 0, scenario: 0, diag: 0, types: new Set() };
    if (st.total < QUOTAS.questionsPerObjective) err(certId, `objectif ${id} : ${st.total} questions (minimum ${QUOTAS.questionsPerObjective})`);
    if (st.scenario * 2 < st.total) err(certId, `objectif ${id} : ${st.scenario}/${st.total} questions en scénario (minimum la moitié)`);
    if (st.diag < QUOTAS.diagnosticPerObjective) err(certId, `objectif ${id} : ${st.diag} questions de diagnostic (minimum ${QUOTAS.diagnosticPerObjective})`);
    if (st.total && st.types.size < 2) warn(certId, `objectif ${id} : un seul type de question`);
  }
  for (const s of skillToObjective.keys()) if (!skillCovered.has(s)) err(certId, `sous-objectif ${s} couvert par aucune question`);

  // Flashcards
  const cardIds = new Set();
  const cardsPer = new Map();
  for (const f of new Set(cert.flashcards.map((c) => c._file))) scanText(f);
  for (const c of cert.flashcards) {
    const w = `${rel(c._file)}#${c.id}`;
    if (cardIds.has(c.id)) err(w, 'id en double');
    cardIds.add(c.id);
    if (!objectiveById.has(String(c.objective))) err(w, `objectif inconnu ${c.objective}`);
    if (!c.front || !c.back) err(w, 'recto ou verso manquant');
    if (!c.source || !LEARN.test(c.source)) err(w, 'source Microsoft Learn manquante');
    cardsPer.set(c.objective, (cardsPer.get(c.objective) ?? 0) + 1);
  }
  for (const id of objectiveById.keys()) {
    const n = cardsPer.get(id) ?? 0;
    if (n < QUOTAS.flashcardsPerObjective) err(certId, `objectif ${id} : ${n} flashcards (minimum ${QUOTAS.flashcardsPerObjective})`);
  }

  // Labs
  const labsPerDomain = new Map();
  let threadLab = 0;
  const labIds = new Set();
  for (const doc of cert.labs) {
    const m = doc.meta;
    const w = rel(doc.file);
    scanText(doc.file);
    if (!m.id || labIds.has(m.id)) err(w, 'id manquant ou en double');
    labIds.add(m.id);
    if (!m.title || !m.duration || !m.cost) err(w, 'titre, durée ou coût manquant');
    if (m.thread) threadLab++;
    const domains = m.thread ? [] : [m.domain];
    for (const d of domains) {
      if (!o.domains.some((x) => x.id === d)) err(w, `domaine inconnu ${d}`);
      labsPerDomain.set(d, (labsPerDomain.get(d) ?? 0) + 1);
    }
    for (const ob of m.objectives ?? []) if (!objectiveById.has(String(ob))) err(w, `objectif inconnu ${ob}`);
    for (const sec of LAB_SECTIONS) if (!new RegExp(`^##\\s+${sec}`, 'm').test(doc.body)) err(w, `section "## ${sec}" manquante`);
    if (!/tenant de test|abonnement personnel/i.test(doc.body)) err(w, 'avertissement "abonnement personnel ou tenant de test" manquant');
    checkSources(w, m.sources);
  }
  for (const d of o.domains) {
    const n = labsPerDomain.get(d.id) ?? 0;
    if (n < QUOTAS.labsPerDomain) err(certId, `domaine ${d.id} : ${n} lab(s) (minimum ${QUOTAS.labsPerDomain})`);
  }
  if (threadLab < 1) err(certId, 'lab fil rouge (thread: true) manquant');

  // Examens blancs
  if (!cert.exams.length) err(certId, 'aucun examen blanc');
  for (const e of cert.exams) {
    const w = rel(e._file);
    if (!e.id || !e.title || !e.durationMinutes) err(w, 'id, titre ou durée manquant');
    const n = e.questions.length;
    if (n < 40) err(w, `${n} questions (minimum 40 pour un examen complet)`);
    for (const d of o.domains) {
      const k = e.questions.filter((q) => objectiveToDomain.get(String(q.objective)) === d.id).length;
      const pct = (k / n) * 100;
      if (pct < d.weight.min - 2 || pct > d.weight.max + 2) err(w, `domaine ${d.id} : ${pct.toFixed(1)} % hors pondération ${d.weight.min}-${d.weight.max} %`);
    }
    const practiceIds = new Set(cert.questions.filter((q) => q.pool === 'practice').map((q) => q.id));
    for (const q of e.questions) if (practiceIds.has(q.id)) err(w, `question ${q.id} réutilisée depuis le pool d'entraînement`);
  }

  // Fiches et étude de cas
  for (const d of o.domains) if (!cert.sheets.some((s) => s.meta.domain === d.id)) err(certId, `fiche de synthèse manquante pour ${d.id}`);
  for (const doc of cert.sheets) { scanText(doc.file); checkSources(rel(doc.file), doc.meta.sources); }
  if (!cert.caseStudies.length) err(certId, 'étude de cas manquante');
  for (const doc of cert.caseStudies) {
    scanText(doc.file);
    if (!/<!--\s*corrige\s*-->/.test(doc.body)) err(rel(doc.file), 'séparateur <!-- corrige --> manquant');
    checkSources(rel(doc.file), doc.meta.sources);
  }

  const practice = cert.questions.filter((q) => q.pool === 'practice').length;
  console.log(`${certId} : ${cert.lessons.length} leçons, ${practice} questions, ${cert.flashcards.length} flashcards, ${cert.labs.length} labs, ${cert.exams.length} examen(s) blanc(s), ${skillCovered.size}/${skillToObjective.size} sous-objectifs couverts`);
}

const certs = only ? [only] : listCerts();
if (!certs.length) err(rel(CONTENT_DIR), 'aucune certification trouvée');
for (const c of certs) validateCert(c);

if (strict && warnings) errors += warnings;
console.log(`\n${errors} erreur(s), ${warnings} avertissement(s).`);
process.exit(errors ? 1 : 0);
