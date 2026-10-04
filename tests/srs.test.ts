import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, GRADES, isDue, newSrs, nextLabel, review } from '../src/lib/srs';

const T = '2026-10-04';

describe('SM-2', () => {
  it('suit la progression 1, 6, puis intervalle x EF', () => {
    let s = newSrs(T);
    s = review(s, GRADES.good, T);
    expect(s.interval).toBe(1);
    expect(s.due).toBe('2026-10-05');
    s = review(s, GRADES.good, s.due);
    expect(s.interval).toBe(6);
    const ef = s.ef;
    s = review(s, GRADES.good, s.due);
    expect(s.interval).toBe(Math.round(6 * ef));
    expect(s.reps).toBe(3);
  });

  it('remet à zéro et compte un oubli en cas d\'échec', () => {
    let s = newSrs(T);
    s = review(s, GRADES.good, T);
    s = review(s, GRADES.good, T);
    s = review(s, GRADES.again, T);
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.lapses).toBe(1);
  });

  it('ne descend jamais sous EF 1.3', () => {
    let s = newSrs(T);
    for (let i = 0; i < 20; i++) s = review(s, GRADES.again, T);
    expect(s.ef).toBe(1.3);
  });

  it('allonge davantage avec « Facile » qu\'avec « Bien »', () => {
    const base = review(review(newSrs(T), GRADES.good, T), GRADES.good, T);
    expect(review(base, GRADES.easy, T).interval).toBeGreaterThan(review(base, GRADES.good, T).interval);
    expect(review(base, GRADES.hard, T).ef).toBeLessThan(base.ef);
  });

  it('gère les dates et l\'échéance', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-10-04', '2027-01-01')).toBe(89);
    expect(isDue({ ...newSrs(T), due: '2026-10-03' }, T)).toBe(true);
    expect(isDue({ ...newSrs(T), due: '2026-10-05' }, T)).toBe(false);
    expect(isDue(undefined, T)).toBe(false);
    expect(nextLabel({ ...newSrs(T), due: '2026-10-05' }, T)).toBe('demain');
  });
});
