// Types du contenu compilé (public/data/<cert>/) et de la progression.

export interface Weight { min: number; max: number }
export interface Skill { id: string; text: string; docs: string[] }
export interface Objective {
  id: string;
  slug: string;
  title: string;
  titleFr: string;
  learningPath: { title: string; url: string };
  skills: Skill[];
}
export interface Domain { id: string; title: string; titleFr: string; weight: Weight; objectives: Objective[] }
export interface Source { title: string; url: string; verified?: string }
export interface TocEntry { id: string; depth: number; text: string }

export interface LessonMeta { objective: string; title: string; minutes: number; verified: string; summary: string }
export interface Lesson extends LessonMeta {
  preQuestions: string[];
  recall: { q: string; a: string }[];
  feynman: { prompt: string; model: string } | null;
  sources: Source[];
  html: string;
  toc: TocEntry[];
}

export type QuestionType = 'single' | 'multiple' | 'order';
export interface Option { id: string; text: string; correct: boolean; why: string }
export interface Question {
  id: string;
  objective: string;
  skills: string[];
  type: QuestionType;
  pool: string;
  scenario: string | null;
  stem: string;
  options: Option[];
  correctOrder?: string[];
  explanation: string;
  lesson: string;
  sources: string[];
  diagnostic: boolean;
  difficulty: number;
}

export interface Flashcard { id: string; objective: string; skills: string[]; front: string; back: string; source: string | null }

export interface LabMeta {
  id: string;
  title: string;
  domain: string;
  objectives: string[];
  skills: string[];
  duration: string;
  cost: string;
  level: string;
  thread: boolean;
  summary: string;
  sources: Source[];
}
export interface Lab extends LabMeta { html: string; toc: TocEntry[] }
export interface Sheet { domain: string; title: string; verified: string; sources: Source[]; html: string }
export interface CaseStudy { id: string; title: string; summary: string; objectives: string[]; sources: Source[]; statement: string; answer: string; toc: TocEntry[] }
export interface ExamMeta { id: string; title: string; durationMinutes: number; count: number; description: string }

export type Depth = 'rappel' | 'approfondi';
export interface StudyPathObjective { depth: Depth; hours: number; why: string }
export interface StudyPath {
  profile: string;
  order: string[];
  objectives: Record<string, StudyPathObjective>;
  finalReview: { minWeeks: number; ratio: number };
}

export interface Catalog {
  cert: {
    id: string;
    code: string;
    title: string;
    examTitle: string;
    level: string;
    durationMinutes: number;
    passingScore: number;
    links: Record<string, string>;
    notes: string[];
  };
  source: { url: string; msDate: string; pageUpdated: string; retrieved: string };
  domains: Domain[];
  path: StudyPath | null;
  lessons: LessonMeta[];
  labs: LabMeta[];
  sheets: { domain: string; title: string }[];
  caseStudies: { id: string; title: string; summary: string }[];
  exams: ExamMeta[];
  counts: { lessons: number; questions: number; examQuestions: number; flashcards: number; labs: number };
  builtAt: string;
}

export interface SearchDoc { id: string; kind: string; title: string; text: string; route: string; objective: string }
