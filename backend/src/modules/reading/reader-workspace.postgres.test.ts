import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const expected = process.env.EPHURIN_EXPECTED_TEST_DB ?? '';
const isolated = expected.startsWith('ephurin_test_') && process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' &&
  new URL(process.env.DATABASE_URL ?? 'postgres://localhost/disabled').pathname === `/${expected}`;

test('reader preferences and position bookmarks persist independently with account and content access checks', { skip: !isolated }, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { getPreferences, savePreferences, getReadingBookmark, saveReadingBookmark, removeReadingBookmark } = await import('./reading.service.js');
  const { readingPreferencesSchema, readingBookmarkSchema } = await import('./reading.schemas.js');
  const { listReadChapterIds, findReadingHistory } = await import('./reading.repository.js');
  const pool = getPostgresPool();
  const author = randomUUID(), reader = randomUUID(), other = randomUUID(), novel = randomUUID();
  const chapters = Array.from({ length: 3 }, () => randomUUID());
  const auth = { userId: reader, role: 'READER' as const };
  try {
    for (const [id, role] of [[author, 'AUTHOR'], [reader, 'READER'], [other, 'READER']]) {
      await pool.query(`insert into users (user_id, email, username, password_hash, role, status) values ($1::uuid, $2, $1::text, 'unused', $3, 'ACTIVE')`, [id, `${id}@example.invalid`, role]);
    }
    await pool.query(`insert into novels (novel_id, author_id, title, slug, synopsis, status) values ($1::uuid, $2, 'Reader workspace', $1::text, 'Fixture', 'PUBLISHED')`, [novel, author]);
    for (const [index, id] of chapters.entries()) {
      await pool.query(`insert into chapters (chapter_id, novel_id, chapter_number, title, status, is_vip, price_coins) values ($1, $2, $3, 'Chapter', $4, $5, $6)`, [id, novel, index + 1, index === 2 ? 'DRAFT' : 'PUBLISHED', index === 1, index === 1 ? 10 : 0]);
    }
    const initial = await getPreferences(auth);
    assert.equal(initial.margin, 24);
    assert.equal(initial.textAlign, 'LEFT');
    const preference = readingPreferencesSchema.parse({ body: { fontFamily: 'Literata', fontSize: 22, background: 'MINT', lineHeight: 1.9, margin: 40, textAlign: 'JUSTIFY' } }).body;
    await savePreferences(auth, preference);
    assert.deepEqual(await getPreferences(auth), preference);
    const legacy = readingPreferencesSchema.parse({ body: { fontFamily: 'Georgia', fontSize: 20, background: 'SEPIA', lineHeight: 1.8 } }).body;
    await savePreferences(auth, legacy);
    assert.equal((await getPreferences(auth)).margin, 40, 'Legacy clients preserve newer reader settings');
    assert.equal((await getPreferences(auth)).textAlign, 'JUSTIFY');
    assert.equal((await getPreferences({ userId: other, role: 'READER' })).margin, 24);
    assert.throws(() => readingPreferencesSchema.parse({ body: { ...preference, margin: 81 } }));
    assert.throws(() => readingBookmarkSchema.parse({ params: { novelId: novel }, body: { chapterId: chapters[0], pageOffset: 2 } }));
    assert.equal(await getReadingBookmark(auth, novel), null);
    const position = { chapterId: chapters[0], paragraphIndex: 8, pageOffset: .35 };
    const saved = await saveReadingBookmark(auth, novel, position);
    assert.equal(saved?.paragraphIndex, 8);
    assert.equal(saved?.pageOffset, .35);
    assert.equal(await getReadingBookmark({ userId: other, role: 'READER' }, novel), null);
    assert.deepEqual(await listReadChapterIds(reader, novel), [], 'Bookmark metadata does not mark content as read');
    assert.equal(await findReadingHistory(reader, novel), null, 'Explicit bookmarks do not overwrite reading history');
    await assert.rejects(saveReadingBookmark(auth, novel, { ...position, chapterId: chapters[1] }), { httpStatus: 402 });
    assert.deepEqual(await getReadingBookmark(auth, novel), saved);
    await assert.rejects(saveReadingBookmark(auth, novel, { ...position, chapterId: chapters[2] }), { httpStatus: 404 });
    await assert.rejects(saveReadingBookmark(auth, randomUUID(), position), { httpStatus: 404 });
    await pool.query("update users set status = 'LOCKED' where user_id = $1", [reader]);
    await assert.rejects(saveReadingBookmark(auth, novel, position), { httpStatus: 403 });
    await pool.query("update users set status = 'ACTIVE' where user_id = $1", [reader]);
    await saveReadingBookmark(auth, novel, { ...position, paragraphIndex: 15 });
    assert.equal((await getReadingBookmark(auth, novel))?.paragraphIndex, 15);
    await pool.query("update chapters set status = 'DRAFT' where chapter_id = $1", [chapters[0]]);
    assert.equal(await getReadingBookmark(auth, novel), null);
    assert.equal((await removeReadingBookmark(auth, novel)).removed, true);
    assert.equal((await removeReadingBookmark(auth, novel)).removed, false);
  } finally {
    await pool.query('delete from novels where novel_id = $1', [novel]);
    await pool.query('delete from users where user_id = any($1::uuid[])', [[author, reader, other]]);
    await disconnectPostgres();
  }
});
