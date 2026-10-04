import type { Domain, Question } from '../src/lib/types';

export const domains: Domain[] = [
  { id: 'd1', title: 'D1', titleFr: 'D1', weight: { min: 20, max: 25 }, objectives: [obj('1.1'), obj('1.2')] },
  { id: 'd2', title: 'D2', titleFr: 'D2', weight: { min: 25, max: 30 }, objectives: [obj('2.1')] },
  { id: 'd3', title: 'D3', titleFr: 'D3', weight: { min: 20, max: 25 }, objectives: [obj('3.1')] },
  { id: 'd4', title: 'D4', titleFr: 'D4', weight: { min: 20, max: 25 }, objectives: [obj('4.1')] },
];

function obj(id: string) {
  return { id, slug: id, title: id, titleFr: id, learningPath: { title: '', url: '' }, skills: [{ id: `${id}.1`, text: '', docs: [] }] };
}

export function q(id: string, objective: string, extra: Partial<Question> = {}): Question {
  return {
    id,
    objective,
    skills: [`${objective}.1`],
    type: 'single',
    pool: 'practice',
    scenario: null,
    stem: `Question ${id}`,
    options: [
      { id: 'a', text: 'A', correct: true, why: '' },
      { id: 'b', text: 'B', correct: false, why: '' },
      { id: 'c', text: 'C', correct: false, why: '' },
    ],
    explanation: '',
    lesson: objective,
    sources: [],
    diagnostic: false,
    difficulty: 2,
    ...extra,
  };
}

export function bank(perObjective = 10): Question[] {
  const out: Question[] = [];
  for (const d of domains) for (const o of d.objectives) for (let i = 0; i < perObjective; i++) out.push(q(`${o.id}-${i}`, o.id, { diagnostic: i < 2 }));
  return out;
}

export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
