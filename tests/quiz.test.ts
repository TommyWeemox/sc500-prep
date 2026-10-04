import { describe, expect, it } from 'vitest';
import { allocateByWeight, buildSession, generateExam, initialOrder, interleave, isCorrect, scaledScore, scoreAnswers, seeded } from '../src/lib/quiz';
import { emptyCertState } from '../src/lib/store';
import { bank, domains, q } from './fixtures';

const T = '2026-10-04';

describe('correction', () => {
  it('choix unique', () => {
    const x = q('x', '1.1');
    expect(isCorrect(x, ['a'])).toBe(true);
    expect(isCorrect(x, ['b'])).toBe(false);
    expect(isCorrect(x, [])).toBe(false);
  });

  it('choix multiple : tout ou rien, ordre indifférent', () => {
    const x = q('x', '1.1', {
      type: 'multiple',
      options: [
        { id: 'a', text: '', correct: true, why: '' },
        { id: 'b', text: '', correct: true, why: '' },
        { id: 'c', text: '', correct: false, why: '' },
        { id: 'd', text: '', correct: false, why: '' },
      ],
    });
    expect(isCorrect(x, ['b', 'a'])).toBe(true);
    expect(isCorrect(x, ['a'])).toBe(false);
    expect(isCorrect(x, ['a', 'b', 'c'])).toBe(false);
  });

  it('ordre d\'étapes', () => {
    const x = q('x', '1.1', { type: 'order', correctOrder: ['a', 'b', 'c'] });
    expect(isCorrect(x, ['a', 'b', 'c'])).toBe(true);
    expect(isCorrect(x, ['b', 'a', 'c'])).toBe(false);
    const rng = seeded(1);
    for (let i = 0; i < 20; i++) expect(isCorrect(x, initialOrder(x, rng))).toBe(false);
  });
});

describe('sessions', () => {
  it('entrelace les objectifs sans répétition consécutive quand c\'est possible', () => {
    const qs = bank(3);
    const out = interleave(qs, seeded(42));
    expect(out).toHaveLength(qs.length);
    for (let i = 1; i < out.length; i++) expect(out[i].objective).not.toBe(out[i - 1].objective);
  });

  it('répartit selon les pondérations (plus forts restes)', () => {
    const a = allocateByWeight(domains, 50);
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(50);
    expect(a.d2).toBeGreaterThan(a.d1);
    expect(a).toEqual({ d1: 12, d2: 14, d3: 12, d4: 12 });
  });

  it('génère un examen aux bonnes proportions', () => {
    const exam = generateExam(bank(20), domains, 40, seeded(3));
    expect(exam).toHaveLength(40);
    const d2 = exam.filter((x) => x.objective === '2.1').length;
    expect(d2).toBe(allocateByWeight(domains, 40).d2);
    expect(new Set(exam.map((x) => x.id)).size).toBe(40);
  });

  it('mode objectif, domaine, diagnostic', () => {
    const cs = emptyCertState();
    const qs = bank(10);
    expect(buildSession(qs, domains, cs, { mode: 'objective', objective: '1.2', count: 5 }, T).every((x) => x.objective === '1.2')).toBe(true);
    const dom = buildSession(qs, domains, cs, { mode: 'domain', domain: 'd1', count: 8 }, T);
    expect(dom).toHaveLength(8);
    expect(dom.every((x) => ['1.1', '1.2'].includes(x.objective))).toBe(true);
    const diag = buildSession(qs, domains, cs, { mode: 'diagnostic', domain: 'd1' }, T);
    expect(diag).toHaveLength(4);
    expect(diag.every((x) => x.diagnostic)).toBe(true);
  });

  it('mode « mes erreurs » et « révisions du jour »', () => {
    const cs = emptyCertState();
    const qs = bank(5);
    cs.mistakes['1.1-0'] = { qid: '1.1-0', objective: '1.1', count: 1, firstAt: T, lastAt: T, lastSelection: ['b'], resolved: false };
    cs.mistakes['1.1-1'] = { qid: '1.1-1', objective: '1.1', count: 1, firstAt: T, lastAt: T, lastSelection: ['b'], resolved: true };
    expect(buildSession(qs, domains, cs, { mode: 'mistakes', count: 10 }, T).map((x) => x.id)).toEqual(['1.1-0']);
    cs.questions['2.1-0'] = { attempts: 1, correct: 0, lastAt: T, lastCorrect: false, streak: 0, srs: { ef: 2.5, interval: 1, reps: 0, lapses: 1, due: '2026-10-04' } };
    expect(buildSession(qs, domains, cs, { mode: 'due', count: 10 }, T).map((x) => x.id)).toEqual(['2.1-0']);
  });

  it('mode mélangé : limité aux objectifs étudiés si demandé, et varié', () => {
    const cs = emptyCertState();
    cs.lessons['1.1'] = { doneAt: T };
    cs.lessons['2.1'] = { doneAt: T };
    const out = buildSession(bank(10), domains, cs, { mode: 'mixed', count: 10, onlyStudied: true }, T, seeded(9));
    expect(new Set(out.map((x) => x.objective))).toEqual(new Set(['1.1', '2.1']));
    const all = buildSession(bank(10), domains, cs, { mode: 'mixed', count: 5 }, T, seeded(9));
    expect(new Set(all.map((x) => x.objective)).size).toBe(5);
  });

  it('score par domaine et score indicatif', () => {
    const qs = [q('a', '1.1'), q('b', '2.1'), q('c', '2.1')];
    const s = scoreAnswers(qs, { a: ['a'], b: ['a'], c: ['b'] }, domains);
    expect(s.correct).toBe(2);
    expect(s.perDomain.d2).toEqual({ total: 2, correct: 1 });
    expect(s.perObjective['1.1']).toEqual({ total: 1, correct: 1 });
    expect(scaledScore(7, 10)).toBe(700);
    expect(scaledScore(0, 0)).toBe(0);
  });
});
