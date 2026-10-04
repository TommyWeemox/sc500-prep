// Estimation de la maîtrise par objectif, à partir des réponses récentes, des flashcards et des leçons.
import type { CertState } from './store';
import type { Domain } from './types';

export interface Mastery {
  objective: string;
  score: number; // 0..1
  accuracy: number | null; // taux pondéré de bonnes réponses récentes
  answered: number;
  cardRetention: number | null;
  lessonDone: boolean;
  confidence: 'aucune' | 'faible' | 'moyenne' | 'bonne';
}

const RECENT = 20;
const DECAY = 0.85;

export function objectiveMastery(cs: CertState, objective: string, cardIds: readonly string[]): Mastery {
  const hist = cs.history.filter((h) => h.objective === objective).slice(-RECENT).reverse();
  // Le diagnostic compte comme des réponses (il est souvent la seule donnée au départ).
  const diag = Object.values(cs.diagnostic).map((d) => d.perObjective[objective]).filter(Boolean);
  let wSum = 0;
  let wOk = 0;
  hist.forEach((h, i) => {
    const w = DECAY ** i;
    wSum += w;
    if (h.correct) wOk += w;
  });
  const histIsEmpty = hist.length === 0;
  for (const t of diag) {
    if (!histIsEmpty) break; // le diagnostic n'est utilisé que tant qu'il n'y a pas d'autres réponses
    wSum += t.total * 0.5;
    wOk += t.correct * 0.5;
  }
  const answered = hist.length + (histIsEmpty ? diag.reduce((a, t) => a + t.total, 0) : 0);
  const accuracy = wSum ? wOk / wSum : null;

  let cardRetention: number | null = null;
  if (cardIds.length) {
    let seen = 0;
    let sum = 0;
    for (const id of cardIds) {
      const c = cs.cards[id];
      if (!c) continue;
      seen++;
      sum += c.srs.reps >= 2 ? 1 : c.srs.reps === 1 ? 0.6 : 0.2;
    }
    cardRetention = seen ? sum / cardIds.length : null;
  }
  const lessonDone = Boolean(cs.lessons[objective]?.doneAt);

  let score: number;
  if (accuracy === null && cardRetention === null) score = lessonDone ? 0.15 : 0;
  else {
    const parts: [number, number][] = [];
    if (accuracy !== null) parts.push([accuracy, 0.65]);
    if (cardRetention !== null) parts.push([cardRetention, 0.2]);
    parts.push([lessonDone ? 1 : 0, 0.15]);
    const w = parts.reduce((a, [, x]) => a + x, 0);
    score = parts.reduce((a, [v, x]) => a + v * x, 0) / w;
    // Peu de réponses : on tire l'estimation vers le bas pour ne pas surévaluer.
    if (answered < 5) score *= 0.6 + answered * 0.08;
  }
  const confidence = answered === 0 ? 'aucune' : answered < 5 ? 'faible' : answered < 15 ? 'moyenne' : 'bonne';
  return { objective, score: Math.max(0, Math.min(1, score)), accuracy, answered, cardRetention, lessonDone, confidence };
}

export function allMastery(cs: CertState, domains: readonly Domain[], cardsByObjective: Map<string, string[]>): Map<string, Mastery> {
  const out = new Map<string, Mastery>();
  for (const d of domains) for (const o of d.objectives) out.set(o.id, objectiveMastery(cs, o.id, cardsByObjective.get(o.id) ?? []));
  return out;
}

/** Points faibles : objectifs avec des données et un score bas, du plus faible au moins faible. */
export function weakPoints(m: Map<string, Mastery>, limit = 3): Mastery[] {
  return [...m.values()].filter((x) => x.answered >= 3 && x.score < 0.7).sort((a, b) => a.score - b.score).slice(0, limit);
}

/** Maîtrise d'un domaine : moyenne des objectifs. */
export function domainMastery(d: Domain, m: Map<string, Mastery>): number {
  const xs = d.objectives.map((o) => m.get(o.id)?.score ?? 0);
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

export function masteryLabel(score: number): string {
  if (score >= 0.85) return 'Maîtrisé';
  if (score >= 0.7) return 'Solide';
  if (score >= 0.45) return 'En cours';
  if (score > 0) return 'Fragile';
  return 'Non commencé';
}
