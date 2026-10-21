import { buildNovels } from './generated-novels.js';

// Assembles the author workspace seed: the accounts and the novels with chapters and story context.
// Free of database code.

export { SEED_PASSWORD, countWords, seedUuid, slugify } from './curated-data.js';
export type { SeedChapter, SeedNovel, SeedUser } from './curated-data.js';
export { seedAuthors, seedReaders } from './population.js';

export const seedNovels = buildNovels();
