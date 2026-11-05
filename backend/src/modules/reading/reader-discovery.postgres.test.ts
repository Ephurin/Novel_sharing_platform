import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

test('reader catalog sorts published words and titles, and filters secondary genres without losing tags', {
  skip: process.env.RUN_READER_DISCOVERY_TESTS !== '1'
}, async () => {
  const schema = `reader_discovery_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  let disconnect: (() => Promise<void>) | undefined;
  try {
    await admin.query(`create schema "${schema}"`);
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.href;
    const database = await import('../../core/database/postgres.js');
    disconnect = database.disconnectPostgres;
    const pool = database.getPostgresPool();
    for (const table of ['users', 'user_profiles', 'novels', 'genres', 'tags', 'novel_tags', 'novel_genres', 'chapters']) {
      await pool.query(`create table "${table}" (like public."${table}" including all)`);
    }
    const { searchPublishedNovels, listReadingFilters } = await import('./reading.repository.js');
    const { searchNovelsSchema } = await import('./reading.schemas.js');
    const author = randomUUID();
    await pool.query(`insert into users (user_id, email, username, password_hash, role)
      values ($1, 'author@example.invalid', 'author', 'unused', 'AUTHOR')`, [author]);
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    for (const [index, title] of ['alpha', 'Beta', 'Zero', 'Draft', 'Deleted'].entries()) {
      await pool.query(`insert into novels (novel_id, author_id, title, slug, synopsis, status, deleted_at)
        values ($1, $2, $3, $3, 'Test novel', $4, $5)`,
      [ids[index], author, title, index === 3 ? 'DRAFT' : 'PUBLISHED', index === 4 ? new Date() : null]);
    }
    for (const [novel, chapter, words, status, deleted] of [
      [ids[0], 1, 600, 'PUBLISHED', false], [ids[0], 2, 400, 'PUBLISHED', false],
      [ids[1], 1, 100, 'PUBLISHED', false], [ids[1], 2, 10000, 'DRAFT', false],
      [ids[1], 3, 100000, 'PUBLISHED', true]
    ]) {
      await pool.query(`insert into chapters (novel_id, title, chapter_number, word_count, status, deleted_at)
        values ($1, 'Test chapter', $2, $3, $4, $5)`, [novel, chapter, words, status, deleted ? new Date() : null]);
    }
    const search = async (query: Record<string, unknown>) => searchPublishedNovels(searchNovelsSchema.parse({ query }).query);
    for (const [sort, expected] of [['wordCount', [ids[2], ids[1], ids[0]]], ['title', [ids[0], ids[1], ids[2]]]] as const) {
      for (const order of ['asc', 'desc']) {
        const result = await search({ sort, order });
        assert.equal(result.totalItems, 3);
        assert.deepEqual(result.items.map(item => item.novelId), order === 'asc' ? expected : [...expected].reverse());
      }
    }
    const page = await search({ sort: 'wordCount', order: 'desc', limit: 1, page: 2 });
    assert.deepEqual(page.items.map(item => item.novelId), [ids[1]]);
    assert.equal(page.items[0].latestChapter.chapterNumber, 1);
    const alpha = await search({ q: 'alpha' });
    assert.equal(alpha.items[0].latestChapter.chapterNumber, 2);
    assert.equal((await search({ q: 'Zero' })).items[0].latestChapter, null);
    assert.equal(page.totalItems, 3);
    const genre = randomUUID();
    await pool.query(`insert into genres (genre_id, name, slug) values ($1, 'Secondary genre', 'secondary-genre')`, [genre]);
    await pool.query(`insert into novel_genres (novel_id, genre_id) values ($1, $2)`, [ids[0], genre]);
    for (const name of ['Adventure', 'Magic', 'Unused']) {
      const tag = randomUUID();
      await pool.query(`insert into tags (tag_id, name, slug) values ($1, $2, $2)`, [tag, name]);
      if (name !== 'Unused') await pool.query(`insert into novel_tags (novel_id, tag_id) values ($1, $2)`, [ids[0], tag]);
    }
    assert.deepEqual(await listReadingFilters(), { genres: ['Secondary genre'], tags: ['Adventure', 'Magic', 'Unused'] });
    const filtered = await search({ genre: 'Secondary genre', tag: 'Magic' });
    assert.equal(filtered.totalItems, 1);
    assert.equal(filtered.items[0].novelId, ids[0]);
    assert.deepEqual(filtered.items[0].tags, ['Adventure', 'Magic']);
    assert.equal((await search({ tag: 'Unused' })).items.length, 0);
  } finally {
    await disconnect?.();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  }
});
