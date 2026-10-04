#!/usr/bin/env node
// Compile le contenu (content/) en JSON statiques (public/data/).
import { buildAll } from './lib/build.mjs';

const list = buildAll();
for (const c of list) {
  const n = c.counts;
  console.log(`${c.code} : ${n.lessons} leçons, ${n.questions} questions, ${n.examQuestions} questions d'examen blanc, ${n.flashcards} flashcards, ${n.labs} labs`);
}
