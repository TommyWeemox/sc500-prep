// Parcours guidé : ordre recommandé et plan semaine par semaine jusqu'à la date d'examen.
import { addDays, daysBetween } from './srs';
import type { DiagnosticResult, Tally } from './store';
import type { StudyPath } from './types';

export interface PlanItem {
  kind: 'lesson' | 'review' | 'final';
  objective?: string;
  hours: number;
  label: string;
  continued?: boolean;
}
export interface PlanWeek { index: number; start: string; end: string; items: PlanItem[]; hours: number }
export interface Plan {
  weeks: PlanWeek[];
  totalHoursNeeded: number;
  totalHoursAvailable: number;
  compressed: boolean;
  ratio: number;
  tooShort: boolean;
}

/** Score de diagnostic par objectif (0..1), ou null sans données. */
export function diagnosticScores(diag: Record<string, DiagnosticResult>): Map<string, number> {
  const agg = new Map<string, Tally>();
  for (const d of Object.values(diag)) {
    for (const [obj, t] of Object.entries(d.perObjective)) {
      const a = agg.get(obj) ?? { total: 0, correct: 0 };
      a.total += t.total;
      a.correct += t.correct;
      agg.set(obj, a);
    }
  }
  return new Map([...agg].filter(([, t]) => t.total).map(([k, t]) => [k, t.correct / t.total]));
}

/**
 * Heures par objectif ajustées au diagnostic : faible (< 50 %) +30 %, fort (>= 80 %) -30 %.
 * L'ordre du profil reste la base car il suit les dépendances (identité avant IA, etc.).
 */
export function adjustedHours(path: StudyPath, diag: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of path.order) {
    const base = path.objectives[id]?.hours ?? 6;
    const s = diag.get(id);
    let h = base;
    if (s !== undefined && s < 0.5) h = base * 1.3;
    else if (s !== undefined && s >= 0.8) h = base * 0.7;
    out.set(id, Math.round(h * 2) / 2);
  }
  return out;
}

/**
 * Ordre recommandé : ordre du profil, mais un objectif très faible au diagnostic
 * remonte d'une place par tranche de 25 points sous 50 %, sans passer devant le premier.
 */
export function recommendedOrder(path: StudyPath, diag: Map<string, number>): string[] {
  const order = [...path.order];
  for (const id of path.order) {
    const s = diag.get(id);
    if (s === undefined || s >= 0.5) continue;
    const shift = s < 0.25 ? 2 : 1;
    const i = order.indexOf(id);
    const j = Math.max(1, i - shift);
    if (j < i) {
      order.splice(i, 1);
      order.splice(j, 0, id);
    }
  }
  return order;
}

export interface PlanInput {
  start: string;
  examDate: string;
  hoursPerWeek: number;
  order: string[];
  hours: Map<string, number>;
  titles: Map<string, string>;
  finalReview: { minWeeks: number; ratio: number };
}

export function buildPlan(input: PlanInput): Plan {
  const days = Math.max(0, daysBetween(input.start, input.examDate));
  const nWeeks = Math.max(1, Math.ceil(days / 7));
  const finalWeeks = Math.min(Math.max(input.finalReview.minWeeks, Math.round(nWeeks * input.finalReview.ratio)), Math.max(0, nWeeks - 1));
  const learnWeeks = nWeeks - finalWeeks;
  // À partir de la 2e semaine, 25 % du temps va aux révisions espacées et aux quiz mélangés.
  const learnCapacity = learnWeeks > 0 ? input.hoursPerWeek * (1 + (learnWeeks - 1) * 0.75) : 0;
  const needed = input.order.reduce((a, id) => a + (input.hours.get(id) ?? 0), 0);
  const ratio = needed > 0 && learnCapacity < needed ? learnCapacity / needed : 1;

  const weeks: PlanWeek[] = [];
  for (let i = 0; i < nWeeks; i++) {
    const start = addDays(input.start, i * 7);
    const end = i === nWeeks - 1 ? input.examDate : addDays(start, 6);
    weeks.push({ index: i + 1, start, end, items: [], hours: 0 });
  }

  // Remplissage séquentiel des semaines d'apprentissage.
  const queue = input.order.map((id) => ({ id, left: (input.hours.get(id) ?? 0) * ratio, started: false }));
  for (let w = 0; w < learnWeeks; w++) {
    const week = weeks[w];
    let cap = w === 0 ? input.hoursPerWeek : input.hoursPerWeek * 0.75;
    if (w > 0) {
      const r = input.hoursPerWeek * 0.25;
      week.items.push({ kind: 'review', hours: round(r), label: 'Révisions du jour (flashcards, erreurs) et quiz mélangé sur les objectifs déjà vus' });
      week.hours += r;
    }
    while (cap > 0.01 && queue.length) {
      const item = queue[0];
      const h = Math.min(cap, item.left);
      if (round(h) > 0) {
        week.items.push({ kind: 'lesson', objective: item.id, hours: round(h), label: input.titles.get(item.id) ?? item.id, continued: item.started });
        week.hours += h;
      }
      item.started = true;
      item.left -= h;
      cap -= h;
      if (item.left <= 0.01) queue.shift();
    }
  }
  // Ce qui reste (plan trop court) est ajouté à la dernière semaine d'apprentissage.
  const lastLearn = weeks[Math.max(0, learnWeeks - 1)];
  for (const item of queue) {
    if (round(item.left) > 0) {
      lastLearn.items.push({ kind: 'lesson', objective: item.id, hours: round(item.left), label: input.titles.get(item.id) ?? item.id, continued: item.started });
      lastLearn.hours += item.left;
    }
  }

  for (let w = learnWeeks; w < nWeeks; w++) {
    const week = weeks[w];
    const isLast = w === nWeeks - 1;
    const items: PlanItem[] = isLast
      ? [
          { kind: 'final', hours: round(input.hoursPerWeek * 0.4), label: 'Examen blanc chronométré, puis analyse des erreurs par domaine' },
          { kind: 'final', hours: round(input.hoursPerWeek * 0.4), label: 'Fiches de synthèse et session « mes erreurs » jusqu\'à zéro erreur active' },
          { kind: 'final', hours: round(input.hoursPerWeek * 0.2), label: 'Veille : relire les encadrés « À retenir pour l\'examen »' },
        ]
      : [
          { kind: 'final', hours: round(input.hoursPerWeek * 0.3), label: 'Étude de cas finale (rédiger avant de lire le corrigé)' },
          { kind: 'final', hours: round(input.hoursPerWeek * 0.4), label: 'Quiz mélangés sur les points faibles du tableau de bord' },
          { kind: 'final', hours: round(input.hoursPerWeek * 0.3), label: 'Refaire sans aide les défis « casse puis répare » des labs' },
        ];
    week.items.push(...items);
    week.hours += input.hoursPerWeek;
  }
  for (const w of weeks) w.hours = round(w.hours);

  return {
    weeks,
    totalHoursNeeded: round(needed),
    totalHoursAvailable: round(learnCapacity),
    compressed: ratio < 1,
    ratio,
    tooShort: days < 14,
  };
}

function round(h: number): number {
  return Math.round(h * 2) / 2;
}
