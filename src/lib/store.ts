// Progression stockée dans le navigateur (localStorage), avec export et import JSON.
import { GRADES, newSrs, review, todayISO, type Grade, type SrsState } from './srs';

export const STORAGE_KEY = 'sc500-prep:v1';
export const STATE_VERSION = 1;
const HISTORY_CAP = 4000;

export interface QuestionStat { attempts: number; correct: number; lastAt: string; lastCorrect: boolean; streak: number; srs?: SrsState }
export interface MistakeEntry { qid: string; objective: string; count: number; firstAt: string; lastAt: string; lastSelection: string[]; resolved: boolean }
export interface CardStat { srs: SrsState; hard: boolean; seen: number }
export interface LessonState { pre?: string[]; startedAt?: string; doneAt?: string; recall?: string[]; recallAt?: string; feynman?: string; feynmanAt?: string }
export interface HistoryEntry { at: string; qid: string; objective: string; correct: boolean; mode: string }
export interface Tally { total: number; correct: number }
export interface DiagnosticResult { at: string; perObjective: Record<string, Tally> }
export interface ExamResult {
  id: string;
  examId: string;
  title: string;
  at: string;
  durationSec: number;
  total: number;
  correct: number;
  perDomain: Record<string, Tally>;
  perObjective: Record<string, Tally>;
  answers: Record<string, string[]>;
  order: string[];
  flagged: string[];
}
export interface Settings { examDate?: string; hoursPerWeek: number; startDate?: string; newCardsPerDay: number }
export interface CertState {
  settings: Settings;
  lessons: Record<string, LessonState>;
  questions: Record<string, QuestionStat>;
  mistakes: Record<string, MistakeEntry>;
  cards: Record<string, CardStat>;
  diagnostic: Record<string, DiagnosticResult>;
  exams: ExamResult[];
  labs: Record<string, { doneAt: string }>;
  caseNotes: Record<string, string>;
  history: HistoryEntry[];
  activity: Record<string, number>;
}
export interface AppState {
  version: number;
  prefs: { theme: 'auto' | 'light' | 'dark'; cert: string };
  certs: Record<string, CertState>;
}

export function emptyCertState(): CertState {
  return {
    settings: { hoursPerWeek: 6, newCardsPerDay: 20 },
    lessons: {},
    questions: {},
    mistakes: {},
    cards: {},
    diagnostic: {},
    exams: [],
    labs: {},
    caseNotes: {},
    history: [],
    activity: {},
  };
}

export function emptyState(defaultCert = 'sc-500'): AppState {
  return { version: STATE_VERSION, prefs: { theme: 'auto', cert: defaultCert }, certs: {} };
}

/** Normalise un état chargé (champs manquants, anciennes versions). */
export function normalize(raw: unknown, defaultCert = 'sc-500'): AppState {
  const base = emptyState(defaultCert);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const state: AppState = {
    version: STATE_VERSION,
    prefs: { ...base.prefs, ...(r.prefs ?? {}) },
    certs: {},
  };
  for (const [id, cs] of Object.entries(r.certs ?? {})) {
    const e = emptyCertState();
    state.certs[id] = { ...e, ...cs, settings: { ...e.settings, ...(cs?.settings ?? {}) } };
  }
  return state;
}

type Listener = () => void;

export class Store {
  state: AppState;
  private listeners = new Set<Listener>();
  private storage: Storage | null;
  private now: () => Date;

  constructor(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null, now: () => Date = () => new Date()) {
    this.storage = storage;
    this.now = now;
    this.state = this.load();
  }

  private load(): AppState {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch {
      return emptyState();
    }
  }

  save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Stockage plein ou indisponible (navigation privée) : la session continue en mémoire.
    }
    for (const l of this.listeners) l();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  today(): string {
    return todayISO(this.now());
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  cert(id = this.state.prefs.cert): CertState {
    if (!this.state.certs[id]) this.state.certs[id] = emptyCertState();
    return this.state.certs[id];
  }

  private bumpActivity(cs: CertState): void {
    const d = this.today();
    cs.activity[d] = (cs.activity[d] ?? 0) + 1;
  }

  /** Enregistre une réponse à une question et met à jour erreurs et répétition espacée. */
  recordAnswer(q: { id: string; objective: string }, correct: boolean, selection: string[], mode: string, certId?: string): void {
    const cs = this.cert(certId);
    const at = this.nowIso();
    const today = this.today();
    const stat = cs.questions[q.id] ?? { attempts: 0, correct: 0, lastAt: at, lastCorrect: false, streak: 0 };
    stat.attempts += 1;
    if (correct) stat.correct += 1;
    stat.streak = correct ? stat.streak + 1 : 0;
    stat.lastAt = at;
    stat.lastCorrect = correct;

    if (!correct) {
      stat.srs = review(stat.srs ?? newSrs(today), GRADES.again, today);
      const m = cs.mistakes[q.id];
      cs.mistakes[q.id] = {
        qid: q.id,
        objective: q.objective,
        count: (m?.count ?? 0) + 1,
        firstAt: m?.firstAt ?? at,
        lastAt: at,
        lastSelection: selection,
        resolved: false,
      };
    } else if (stat.srs) {
      // Question déjà ratée : elle reste dans la file jusqu'à deux bonnes réponses d'affilée.
      stat.srs = review(stat.srs, GRADES.good, today);
      const m = cs.mistakes[q.id];
      if (m && stat.streak >= 2) m.resolved = true;
    }
    cs.questions[q.id] = stat;
    cs.history.push({ at, qid: q.id, objective: q.objective, correct, mode });
    if (cs.history.length > HISTORY_CAP) cs.history.splice(0, cs.history.length - HISTORY_CAP);
    this.bumpActivity(cs);
    this.save();
  }

  gradeCard(cardId: string, grade: Grade, certId?: string): CardStat {
    const cs = this.cert(certId);
    const today = this.today();
    const c = cs.cards[cardId] ?? { srs: newSrs(today), hard: false, seen: 0 };
    c.srs = review(c.srs, grade, today);
    c.seen += 1;
    cs.cards[cardId] = c;
    this.bumpActivity(cs);
    this.save();
    return c;
  }

  toggleHard(cardId: string, certId?: string): boolean {
    const cs = this.cert(certId);
    const c = cs.cards[cardId] ?? { srs: newSrs(this.today()), hard: false, seen: 0 };
    c.hard = !c.hard;
    cs.cards[cardId] = c;
    this.save();
    return c.hard;
  }

  updateLesson(objective: string, patch: Partial<LessonState>, certId?: string): LessonState {
    const cs = this.cert(certId);
    const l = { ...(cs.lessons[objective] ?? {}), ...patch };
    if (!l.startedAt) l.startedAt = this.nowIso();
    cs.lessons[objective] = l;
    this.save();
    return l;
  }

  updateSettings(patch: Partial<Settings>, certId?: string): void {
    const cs = this.cert(certId);
    cs.settings = { ...cs.settings, ...patch };
    this.save();
  }

  saveDiagnostic(domainId: string, perObjective: Record<string, Tally>, certId?: string): void {
    this.cert(certId).diagnostic[domainId] = { at: this.nowIso(), perObjective };
    this.save();
  }

  saveExam(result: ExamResult, certId?: string): void {
    this.cert(certId).exams.push(result);
    this.save();
  }

  setLabDone(labId: string, done: boolean, certId?: string): void {
    const cs = this.cert(certId);
    if (done) cs.labs[labId] = { doneAt: this.nowIso() };
    else delete cs.labs[labId];
    this.save();
  }

  setCaseNotes(caseId: string, text: string, certId?: string): void {
    this.cert(certId).caseNotes[caseId] = text;
    this.save();
  }

  setPrefs(patch: Partial<AppState['prefs']>): void {
    this.state.prefs = { ...this.state.prefs, ...patch };
    this.save();
  }

  exportJson(): string {
    return JSON.stringify({ app: 'sc500-prep', exportedAt: this.nowIso(), ...this.state }, null, 2);
  }

  /** Remplace la progression par un export. Lève une erreur si le fichier n'est pas reconnu. */
  importJson(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Le fichier n'est pas un JSON valide.");
    }
    const p = parsed as Partial<AppState> & { app?: string };
    if (!p || typeof p !== 'object' || p.app !== 'sc500-prep' || typeof p.certs !== 'object' || p.certs === null) {
      throw new Error("Ce fichier n'est pas un export de progression sc500-prep.");
    }
    if (typeof p.version === 'number' && p.version > STATE_VERSION) {
      throw new Error("Cet export vient d'une version plus récente du site.");
    }
    this.state = normalize(p);
    this.save();
  }

  reset(): void {
    this.state = emptyState(this.state.prefs.cert);
    this.save();
  }
}
