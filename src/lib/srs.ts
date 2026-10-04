// Répétition espacée : algorithme SM-2 (SuperMemo 2), avec un léger bonus pour « Facile ».
// Utilisé pour les flashcards et pour les questions ratées.

export interface SrsState {
  ef: number; // facteur de facilité, plancher 1.3
  interval: number; // en jours
  reps: number; // révisions réussies consécutives
  lapses: number; // nombre d'oublis
  due: string; // date AAAA-MM-JJ
  last?: string;
}

/** 0-2 : échec ; 3 : difficile ; 4 : bien ; 5 : facile. */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

export const GRADES = {
  again: 1 as Grade,
  hard: 3 as Grade,
  good: 4 as Grade,
  easy: 5 as Grade,
};

export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return todayISO(date);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function newSrs(today: string): SrsState {
  return { ef: 2.5, interval: 0, reps: 0, lapses: 0, due: today };
}

export function review(state: SrsState, grade: Grade, today: string): SrsState {
  const s = { ...state };
  if (grade < 3) {
    s.reps = 0;
    s.lapses += 1;
    s.interval = 1;
  } else {
    if (s.reps === 0) s.interval = 1;
    else if (s.reps === 1) s.interval = 6;
    else s.interval = Math.round(s.interval * s.ef);
    if (grade === 5) s.interval = Math.max(s.interval + 1, Math.round(s.interval * 1.3));
    s.reps += 1;
  }
  s.ef = Math.max(1.3, s.ef + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  s.ef = Math.round(s.ef * 100) / 100;
  s.due = addDays(today, s.interval);
  s.last = today;
  return s;
}

export function isDue(state: SrsState | undefined, today: string): boolean {
  return Boolean(state) && state!.due <= today;
}

/** Libellé lisible de la prochaine échéance. */
export function nextLabel(state: SrsState, today: string): string {
  const n = daysBetween(today, state.due);
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n < 30) return `dans ${n} jours`;
  return `dans ${Math.round(n / 30)} mois`;
}
