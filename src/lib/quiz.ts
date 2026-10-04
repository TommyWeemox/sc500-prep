// Moteur de quiz : correction, mélange, entrelacement et construction des sessions.
import type { CertState } from './store';
import { isDue } from './srs';
import type { Domain, Question } from './types';

export type Rng = () => number;

/** Générateur pseudo-aléatoire déterministe (mulberry32), utile pour les tests. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Une réponse est juste si elle est exactement la bonne (pas de point partiel, comme à l'examen). */
export function isCorrect(q: Question, answer: readonly string[]): boolean {
  if (q.type === 'order') {
    const expected = q.correctOrder ?? q.options.map((o) => o.id);
    return answer.length === expected.length && expected.every((id, i) => answer[i] === id);
  }
  const expected = q.options.filter((o) => o.correct).map((o) => o.id).sort();
  const given = [...new Set(answer)].sort();
  return expected.length === given.length && expected.every((id, i) => given[i] === id);
}

/** Ordre initial des étapes affiché pour une question d'ordre : jamais l'ordre correct. */
export function initialOrder(q: Question, rng: Rng = Math.random): string[] {
  const ids = q.options.map((o) => o.id);
  if (ids.length < 2) return ids;
  for (let i = 0; i < 10; i++) {
    const s = shuffle(ids, rng);
    if (!isCorrect(q, s)) return s;
  }
  return [...ids].reverse();
}

/** Réordonne pour éviter deux questions consécutives du même objectif (entrelacement). */
export function interleave(questions: readonly Question[], rng: Rng = Math.random): Question[] {
  const groups = new Map<string, Question[]>();
  for (const q of shuffle(questions, rng)) {
    if (!groups.has(q.objective)) groups.set(q.objective, []);
    groups.get(q.objective)!.push(q);
  }
  const out: Question[] = [];
  let last = '';
  while (out.length < questions.length) {
    const candidates = [...groups.entries()].filter(([k, v]) => v.length && k !== last);
    const pool = candidates.length ? candidates : [...groups.entries()].filter(([, v]) => v.length);
    // Priorité au groupe le plus fourni pour ne pas finir par une série du même objectif.
    pool.sort((a, b) => b[1].length - a[1].length);
    const top = pool.filter(([, v]) => v.length === pool[0][1].length);
    const [key, list] = top[Math.floor(rng() * top.length)];
    out.push(list.shift()!);
    last = key;
  }
  return out;
}

/** Répartit `total` entre les domaines selon le milieu de leur pondération (plus forts restes). */
export function allocateByWeight(domains: readonly Domain[], total: number): Record<string, number> {
  const mids = domains.map((d) => (d.weight.min + d.weight.max) / 2);
  const sum = mids.reduce((a, b) => a + b, 0);
  const raw = mids.map((m) => (m / sum) * total);
  const counts = raw.map(Math.floor);
  let rest = total - counts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    counts[i]++;
    rest--;
  }
  return Object.fromEntries(domains.map((d, i) => [d.id, counts[i]]));
}

export function objectiveDomainMap(domains: readonly Domain[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of domains) for (const o of d.objectives) m.set(o.id, d.id);
  return m;
}

/** Examen généré : tirage dans le pool d'entraînement selon les pondérations officielles. */
export function generateExam(questions: readonly Question[], domains: readonly Domain[], total: number, rng: Rng = Math.random): Question[] {
  const byDomain = objectiveDomainMap(domains);
  const alloc = allocateByWeight(domains, total);
  const picked: Question[] = [];
  for (const d of domains) {
    const pool = shuffle(questions.filter((q) => byDomain.get(q.objective) === d.id), rng);
    // Couvre d'abord chaque objectif du domaine, puis complète au hasard.
    const byObj = new Map<string, Question[]>();
    for (const q of pool) {
      if (!byObj.has(q.objective)) byObj.set(q.objective, []);
      byObj.get(q.objective)!.push(q);
    }
    const chosen: Question[] = [];
    while (chosen.length < alloc[d.id] && [...byObj.values()].some((l) => l.length)) {
      for (const l of byObj.values()) {
        if (chosen.length >= alloc[d.id]) break;
        const q = l.shift();
        if (q) chosen.push(q);
      }
    }
    picked.push(...chosen);
  }
  return shuffle(picked, rng);
}

export type SessionMode = 'objective' | 'domain' | 'mixed' | 'mistakes' | 'due' | 'diagnostic' | 'question';

export interface SessionOptions {
  mode: SessionMode;
  objective?: string;
  domain?: string;
  count?: number;
  onlyStudied?: boolean;
  id?: string;
}

/** Construit une session d'entraînement (hors examen blanc). */
export function buildSession(
  all: readonly Question[],
  domains: readonly Domain[],
  cs: CertState,
  opts: SessionOptions,
  today: string,
  rng: Rng = Math.random,
): Question[] {
  const practice = all.filter((q) => q.pool === 'practice');
  const byDomain = objectiveDomainMap(domains);
  const count = opts.count ?? 10;
  const take = (qs: Question[]) => qs.slice(0, count);

  switch (opts.mode) {
    case 'question':
      return all.filter((q) => q.id === opts.id);
    case 'objective':
      return take(prioritize(practice.filter((q) => q.objective === opts.objective), cs, rng));
    case 'domain':
      return interleave(take(prioritize(practice.filter((q) => byDomain.get(q.objective) === opts.domain), cs, rng)), rng);
    case 'diagnostic': {
      const qs = practice.filter((q) => q.diagnostic && byDomain.get(q.objective) === opts.domain);
      return interleave(qs, rng);
    }
    case 'mistakes': {
      const ids = new Set(Object.values(cs.mistakes).filter((m) => !m.resolved).map((m) => m.qid));
      return interleave(take(shuffle(all.filter((q) => ids.has(q.id)), rng)), rng);
    }
    case 'due': {
      const due = all.filter((q) => isDue(cs.questions[q.id]?.srs, today));
      return interleave(take(due), rng);
    }
    case 'mixed': {
      const studied = new Set(Object.entries(cs.lessons).filter(([, l]) => l.doneAt).map(([id]) => id));
      let pool = practice;
      if (opts.onlyStudied && studied.size >= 2) pool = practice.filter((q) => studied.has(q.objective));
      return interleave(take(prioritize(pool, cs, rng, true)), rng);
    }
    default:
      return [];
  }
}

/**
 * Priorise les questions jamais vues, puis les ratées, puis les autres.
 * Avec `spread`, alterne les objectifs pour que la coupe à `count` reste variée.
 */
export function prioritize(qs: readonly Question[], cs: CertState, rng: Rng = Math.random, spread = false): Question[] {
  const rank = (q: Question) => {
    const s = cs.questions[q.id];
    if (!s) return 0;
    if (!s.lastCorrect) return 1;
    return 2 + s.streak;
  };
  const shuffled = shuffle(qs, rng);
  const sorted = shuffled.sort((a, b) => rank(a) - rank(b));
  if (!spread) return sorted;
  const groups = new Map<string, Question[]>();
  for (const q of sorted) {
    if (!groups.has(q.objective)) groups.set(q.objective, []);
    groups.get(q.objective)!.push(q);
  }
  const out: Question[] = [];
  const lists = shuffle([...groups.values()], rng);
  while (out.length < sorted.length) for (const l of lists) if (l.length) out.push(l.shift()!);
  return out;
}

export interface ScoreBreakdown { total: number; correct: number; perDomain: Record<string, { total: number; correct: number }>; perObjective: Record<string, { total: number; correct: number }> }

export function scoreAnswers(questions: readonly Question[], answers: Record<string, string[]>, domains: readonly Domain[]): ScoreBreakdown {
  const byDomain = objectiveDomainMap(domains);
  const out: ScoreBreakdown = { total: questions.length, correct: 0, perDomain: {}, perObjective: {} };
  for (const d of domains) out.perDomain[d.id] = { total: 0, correct: 0 };
  for (const q of questions) {
    const ok = isCorrect(q, answers[q.id] ?? []);
    const d = byDomain.get(q.objective)!;
    out.perDomain[d].total++;
    out.perObjective[q.objective] ??= { total: 0, correct: 0 };
    out.perObjective[q.objective].total++;
    if (ok) {
      out.correct++;
      out.perDomain[d].correct++;
      out.perObjective[q.objective].correct++;
    }
  }
  return out;
}

/** Score indicatif sur 1000. Le barème réel de Microsoft n'est pas public. */
export function scaledScore(correct: number, total: number): number {
  return total ? Math.round((correct / total) * 1000) : 0;
}
