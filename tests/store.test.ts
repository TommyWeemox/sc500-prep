import { describe, expect, it } from 'vitest';
import { GRADES } from '../src/lib/srs';
import { STORAGE_KEY, Store } from '../src/lib/store';
import { MemoryStorage } from './fixtures';

const fixedNow = () => new Date('2026-10-04T09:00:00');

describe('progression', () => {
  it('enregistre une erreur, la planifie, puis la résout après deux bonnes réponses', () => {
    const s = new Store(new MemoryStorage(), fixedNow);
    const q = { id: 'q1', objective: '1.1' };
    s.recordAnswer(q, false, ['b'], 'quiz');
    const cs = s.cert('sc-500');
    expect(cs.mistakes.q1.count).toBe(1);
    expect(cs.mistakes.q1.resolved).toBe(false);
    expect(cs.questions.q1.srs?.due).toBe('2026-10-05');
    s.recordAnswer(q, true, ['a'], 'quiz');
    expect(cs.mistakes.q1.resolved).toBe(false);
    s.recordAnswer(q, true, ['a'], 'quiz');
    expect(cs.mistakes.q1.resolved).toBe(true);
    expect(cs.history).toHaveLength(3);
    expect(cs.activity['2026-10-04']).toBe(3);
  });

  it('une bonne réponse du premier coup ne crée pas de révision', () => {
    const s = new Store(new MemoryStorage(), fixedNow);
    s.recordAnswer({ id: 'q2', objective: '1.1' }, true, ['a'], 'quiz');
    expect(s.cert().questions.q2.srs).toBeUndefined();
    expect(s.cert().mistakes.q2).toBeUndefined();
  });

  it('flashcards : notation et marquage difficile', () => {
    const s = new Store(new MemoryStorage(), fixedNow);
    const c = s.gradeCard('c1', GRADES.good);
    expect(c.srs.due).toBe('2026-10-05');
    expect(s.toggleHard('c1')).toBe(true);
    expect(s.cert().cards.c1.hard).toBe(true);
  });

  it('persiste dans le stockage et recharge', () => {
    const storage = new MemoryStorage();
    const a = new Store(storage, fixedNow);
    a.updateLesson('1.1', { doneAt: '2026-10-04' });
    a.updateSettings({ examDate: '2027-02-15', hoursPerWeek: 8 });
    const b = new Store(storage, fixedNow);
    expect(b.cert().lessons['1.1'].doneAt).toBe('2026-10-04');
    expect(b.cert().settings.hoursPerWeek).toBe(8);
    expect(b.cert().settings.newCardsPerDay).toBe(20);
  });

  it('export puis import restitue la même progression', () => {
    const a = new Store(new MemoryStorage(), fixedNow);
    a.recordAnswer({ id: 'q1', objective: '1.1' }, false, ['b'], 'quiz');
    a.gradeCard('c1', GRADES.easy);
    a.setLabDone('lab-1', true);
    const json = a.exportJson();
    const b = new Store(new MemoryStorage(), fixedNow);
    b.importJson(json);
    expect(b.cert().mistakes.q1.count).toBe(1);
    expect(b.cert().cards.c1.srs.reps).toBe(1);
    expect(b.cert().labs['lab-1']).toBeDefined();
    expect(JSON.parse(b.exportJson()).certs).toEqual(JSON.parse(json).certs);
  });

  it('refuse un fichier qui n\'est pas un export', () => {
    const s = new Store(new MemoryStorage(), fixedNow);
    expect(() => s.importJson('pas du json')).toThrow(/JSON valide/);
    expect(() => s.importJson('{"foo":1}')).toThrow(/export/);
    expect(() => s.importJson(JSON.stringify({ app: 'sc500-prep', version: 99, certs: {} }))).toThrow(/plus récente/);
  });

  it('résiste à un stockage corrompu', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{cassé');
    const s = new Store(storage, fixedNow);
    expect(s.cert().history).toEqual([]);
  });

  it('réinitialise', () => {
    const s = new Store(new MemoryStorage(), fixedNow);
    s.recordAnswer({ id: 'q1', objective: '1.1' }, false, [], 'quiz');
    s.reset();
    expect(s.cert().history).toHaveLength(0);
  });
});
