// Chargement du contenu brut d'une certification (Markdown + JSON), sans rendu.
// Utilisé par le build, la validation et la liste des points à vérifier.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT_DIR = path.join(ROOT, 'content');

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Sépare le front matter YAML du corps Markdown. */
export function readMarkdown(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const m = raw.match(FRONT_MATTER);
  if (!m) return { meta: {}, body: raw, file };
  return { meta: parseYaml(m[1]) ?? {}, body: raw.slice(m[0].length), file };
}

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => path.join(dir, f));
}

/** Liste des certifications : un dossier par certification contenant objectives.json. */
export function listCerts() {
  return fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT_DIR, d.name, 'objectives.json')))
    .map((d) => d.name)
    .sort();
}

/** Charge tout le contenu d'une certification. */
export function loadCert(certId) {
  const dir = path.join(CONTENT_DIR, certId);
  const objectives = readJson(path.join(dir, 'objectives.json'));
  const pathFile = path.join(dir, 'path.json');
  const studyPath = fs.existsSync(pathFile) ? readJson(pathFile) : null;

  const lessons = listFiles(path.join(dir, 'lessons'), '.md').map(readMarkdown);
  const labs = listFiles(path.join(dir, 'labs'), '.md').map(readMarkdown);
  const sheets = listFiles(path.join(dir, 'sheets'), '.md').map(readMarkdown);
  const caseStudies = listFiles(path.join(dir, 'case-studies'), '.md').map(readMarkdown);

  const questions = [];
  for (const file of listFiles(path.join(dir, 'questions'), '.json')) {
    for (const q of readJson(file)) questions.push({ ...q, pool: 'practice', _file: file });
  }
  const exams = listFiles(path.join(dir, 'exams'), '.json').map((file) => {
    const exam = readJson(file);
    for (const q of exam.questions) {
      q.pool = exam.id;
      q._file = file;
      questions.push(q);
    }
    return { ...exam, _file: file };
  });

  const flashcards = [];
  for (const file of listFiles(path.join(dir, 'flashcards'), '.json')) {
    for (const c of readJson(file)) flashcards.push({ ...c, _file: file });
  }

  return { id: certId, dir, objectives, studyPath, lessons, labs, sheets, caseStudies, questions, exams, flashcards };
}

/** Index pratique : objectif -> domaine, sous-objectif -> objectif. */
export function indexObjectives(objectives) {
  const objectiveToDomain = new Map();
  const skillToObjective = new Map();
  const objectiveById = new Map();
  for (const d of objectives.domains) {
    for (const o of d.objectives) {
      objectiveToDomain.set(o.id, d.id);
      objectiveById.set(o.id, o);
      for (const s of o.skills) skillToObjective.set(s.id, o.id);
    }
  }
  return { objectiveToDomain, skillToObjective, objectiveById };
}

/** Toutes les URL citées par le contenu, pour la vérification des liens. */
export function collectUrls(cert) {
  const urls = new Map();
  const add = (url, where) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    const clean = url.split('#')[0];
    if (!urls.has(clean)) urls.set(clean, new Set());
    urls.get(clean).add(where);
  };
  const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
  const o = cert.objectives;
  for (const v of Object.values(o.cert.links)) add(v, 'objectives.json');
  add(o.source.url, 'objectives.json');
  for (const d of o.domains) for (const ob of d.objectives) {
    add(ob.learningPath.url, 'objectives.json');
    for (const s of ob.skills) for (const u of s.docs) add(u, 'objectives.json');
  }
  for (const doc of [...cert.lessons, ...cert.labs, ...cert.sheets, ...cert.caseStudies]) {
    for (const s of doc.meta.sources ?? []) add(s.url, rel(doc.file));
    for (const m of doc.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) add(m[1], rel(doc.file));
  }
  for (const q of cert.questions) for (const u of q.sources ?? []) add(u, rel(q._file));
  for (const c of cert.flashcards) if (c.source) add(c.source, rel(c._file));
  return urls;
}
