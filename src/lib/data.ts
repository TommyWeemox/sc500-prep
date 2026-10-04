// Chargement paresseux des données compilées, avec cache mémoire.
import type { Catalog, CaseStudy, Flashcard, Lab, Lesson, Question, SearchDoc, Sheet } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;
const cache = new Map<string, Promise<unknown>>();

function get<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(BASE + path).then((r) => {
      if (!r.ok) throw new Error(`Chargement impossible : ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export interface CertListItem { id: string; code: string; title: string }

export const data = {
  certs: () => get<CertListItem[]>('certs.json'),
  catalog: (cert: string) => get<Catalog>(`${cert}/catalog.json`),
  questions: (cert: string) => get<Question[]>(`${cert}/questions.json`),
  flashcards: (cert: string) => get<Flashcard[]>(`${cert}/flashcards.json`),
  lesson: (cert: string, objective: string) => get<Lesson>(`${cert}/lessons/${objective}.json`),
  lab: (cert: string, id: string) => get<Lab>(`${cert}/labs/${id}.json`),
  sheet: (cert: string, domain: string) => get<Sheet>(`${cert}/sheets/${domain}.json`),
  caseStudy: (cert: string, id: string) => get<CaseStudy>(`${cert}/case-studies/${id}.json`),
  search: (cert: string) => get<SearchDoc[]>(`${cert}/search.json`),
};
