// Contexte partagé par les vues : progression, catalogue et index pratiques.
import { data } from './lib/data';
import { allMastery, type Mastery } from './lib/mastery';
import { Store } from './lib/store';
import type { Catalog, Domain, Flashcard, Objective, Question } from './lib/types';

export const store = new Store();

export interface Ctx {
  cert: string;
  catalog: Catalog;
  objectives: Map<string, Objective>;
  domainOf: Map<string, Domain>;
  domains: Map<string, Domain>;
}

const ctxCache = new Map<string, Promise<Ctx>>();

export function getCtx(): Promise<Ctx> {
  const cert = store.state.prefs.cert;
  if (!ctxCache.has(cert)) {
    ctxCache.set(
      cert,
      data.catalog(cert).then((catalog) => {
        const objectives = new Map<string, Objective>();
        const domainOf = new Map<string, Domain>();
        const domains = new Map<string, Domain>();
        for (const d of catalog.domains) {
          domains.set(d.id, d);
          for (const o of d.objectives) {
            objectives.set(o.id, o);
            domainOf.set(o.id, d);
          }
        }
        return { cert, catalog, objectives, domainOf, domains };
      }),
    );
  }
  return ctxCache.get(cert)!;
}

export async function getQuestions(): Promise<Question[]> {
  return data.questions(store.state.prefs.cert);
}

export async function getCards(): Promise<Flashcard[]> {
  return data.flashcards(store.state.prefs.cert);
}

export async function getMastery(ctx: Ctx): Promise<Map<string, Mastery>> {
  const cards = await getCards();
  const byObj = new Map<string, string[]>();
  for (const c of cards) {
    if (!byObj.has(c.objective)) byObj.set(c.objective, []);
    byObj.get(c.objective)!.push(c.id);
  }
  return allMastery(store.cert(ctx.cert), ctx.catalog.domains, byObj);
}

export function objectiveLabel(ctx: Ctx, id: string): string {
  const o = ctx.objectives.get(id);
  return o ? `${o.id} · ${o.titleFr}` : id;
}

/** Lien vers la leçon (et l'ancre éventuelle « 1.1#pim »). */
export function lessonHref(ref: string): string {
  const [obj, anchor] = ref.split('#');
  return `#/cours/${obj}${anchor ? `#${anchor}` : ''}`;
}

export function lessonHasContent(ctx: Ctx, objective: string): boolean {
  return ctx.catalog.lessons.some((l) => l.objective === objective);
}
