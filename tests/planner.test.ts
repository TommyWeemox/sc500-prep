import { describe, expect, it } from 'vitest';
import { objectiveMastery, weakPoints } from '../src/lib/mastery';
import { adjustedHours, buildPlan, diagnosticScores, recommendedOrder } from '../src/lib/planner';
import { emptyCertState } from '../src/lib/store';
import type { StudyPath } from '../src/lib/types';

const path: StudyPath = {
  profile: '',
  order: ['1.1', '1.2', '2.1', '3.1'],
  objectives: {
    '1.1': { depth: 'approfondi', hours: 10, why: '' },
    '1.2': { depth: 'approfondi', hours: 6, why: '' },
    '2.1': { depth: 'rappel', hours: 4, why: '' },
    '3.1': { depth: 'approfondi', hours: 8, why: '' },
  },
  finalReview: { minWeeks: 1, ratio: 0.15 },
};

describe('planificateur', () => {
  it('ajuste heures et ordre au diagnostic', () => {
    const diag = diagnosticScores({ d1: { at: '', perObjective: { '3.1': { total: 4, correct: 0 }, '2.1': { total: 2, correct: 2 } } } });
    const h = adjustedHours(path, diag);
    expect(h.get('3.1')).toBe(10.5);
    expect(h.get('2.1')).toBe(3);
    expect(h.get('1.1')).toBe(10);
    const order = recommendedOrder(path, diag);
    expect(order[0]).toBe('1.1');
    expect(order.indexOf('3.1')).toBeLessThan(3);
  });

  it('construit un plan qui couvre tout et réserve la fin aux révisions', () => {
    const plan = buildPlan({
      start: '2026-10-05',
      examDate: '2027-01-25',
      hoursPerWeek: 6,
      order: path.order,
      hours: adjustedHours(path, new Map()),
      titles: new Map(),
      finalReview: path.finalReview,
    });
    expect(plan.weeks.length).toBe(16);
    expect(plan.compressed).toBe(false);
    const planned = new Map<string, number>();
    for (const w of plan.weeks) for (const it of w.items) if (it.objective) planned.set(it.objective, (planned.get(it.objective) ?? 0) + it.hours);
    expect(planned.get('1.1')).toBeCloseTo(10, 0);
    const last = plan.weeks.at(-1)!;
    expect(last.items.every((i) => i.kind === 'final')).toBe(true);
    expect(last.end).toBe('2027-01-25');
    expect(plan.weeks[1].items[0].kind).toBe('review');
  });

  it('signale un plan compressé', () => {
    const plan = buildPlan({ start: '2026-10-05', examDate: '2026-10-26', hoursPerWeek: 2, order: path.order, hours: adjustedHours(path, new Map()), titles: new Map(), finalReview: path.finalReview });
    expect(plan.compressed).toBe(true);
    expect(plan.ratio).toBeLessThan(1);
  });
});

describe('maîtrise', () => {
  it('reste à 0 sans données et monte avec les bonnes réponses', () => {
    const cs = emptyCertState();
    expect(objectiveMastery(cs, '1.1', []).score).toBe(0);
    for (let i = 0; i < 10; i++) cs.history.push({ at: '', qid: `q${i}`, objective: '1.1', correct: true, mode: 'quiz' });
    cs.lessons['1.1'] = { doneAt: 'x' };
    const m = objectiveMastery(cs, '1.1', []);
    expect(m.score).toBeGreaterThan(0.9);
    expect(m.confidence).toBe('moyenne');
  });

  it('pondère les réponses récentes et détecte les points faibles', () => {
    const cs = emptyCertState();
    for (let i = 0; i < 6; i++) cs.history.push({ at: '', qid: `a${i}`, objective: '1.1', correct: true, mode: 'quiz' });
    for (let i = 0; i < 6; i++) cs.history.push({ at: '', qid: `b${i}`, objective: '1.1', correct: false, mode: 'quiz' });
    const m = objectiveMastery(cs, '1.1', []);
    expect(m.accuracy!).toBeLessThan(0.5);
    const weak = weakPoints(new Map([['1.1', m]]));
    expect(weak.map((w) => w.objective)).toEqual(['1.1']);
  });

  it('utilise le diagnostic tant qu\'il n\'y a pas d\'autres réponses', () => {
    const cs = emptyCertState();
    cs.diagnostic.d1 = { at: '', perObjective: { '1.1': { total: 2, correct: 2 } } };
    const m = objectiveMastery(cs, '1.1', []);
    expect(m.answered).toBe(2);
    expect(m.score).toBeGreaterThan(0);
  });
});
