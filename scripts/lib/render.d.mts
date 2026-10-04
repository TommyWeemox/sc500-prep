export function createRenderer(): { headings: { id: string; depth: number; text: string }[]; block(md: string): string; inline(md: string): string };
export function slugify(text: string): string;
export function splitSections(md: string): { title: string; id: string; text: string }[];
export function toPlainText(md: string): string;
