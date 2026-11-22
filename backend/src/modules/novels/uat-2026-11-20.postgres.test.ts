import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const expected = process.env.EPHURIN_EXPECTED_TEST_DB ?? '';
const isolated = expected.startsWith('ephurin_test_') && process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' &&
  new URL(process.env.DATABASE_URL ?? 'postgres://localhost/disabled').pathname === `/${expected}`;

// UAT 2026-11-20: BUG-001 (the paywall did not know the price), BUG-002 (searching "kiem" missed "Kiếm")
// and BUG-003 (the author could not change the age rating).
test('paywall carries the price, search ignores accents, the author sets the age rating', { skip: !isolated }, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { getReaderChapter, getReaderNovel } = await import('../reading/reading.service.js');
  const { listNovels } = await import('./novels.repository.js');
  const { updateNovel } = await import('./novels.service.js');
  const { listNovelsSchema } = await import('./novels.schemas.js');
  const pool = getPostgresPool();
  const author = randomUUID(), reader = randomUUID(), novel = randomUUID(), vip = randomUUID();
  const marker = `uat${Date.now()}`;
  try {
    for (const [id, role] of [[author, 'AUTHOR'], [reader, 'READER']]) {
      await pool.query(`insert into users (user_id, email, username, password_hash, role, status) values ($1::uuid, $2, $1::text, 'unused', $3, 'ACTIVE')`, [id, `${id}@example.invalid`, role]);
    }
    await pool.query(`insert into novels (novel_id, author_id, title, slug, synopsis, status, published_at)
      values ($1::uuid, $2, $3, $1::text, 'Truyện thử cho việc tìm kiếm không dấu và đặt độ tuổi của tác phẩm.', 'PUBLISHED', now())`,
      [novel, author, `Kiếm Đạo ${marker}`]);
    await pool.query(`insert into chapters (chapter_id, novel_id, chapter_number, title, status, is_vip, price_coins, published_at)
      values ($1, $2, 1, 'VIP', 'PUBLISHED', true, 15, now())`, [vip, novel]);

    // BUG-001: the 402 says what unlocking costs.
    await assert.rejects(getReaderChapter(vip, { userId: reader, role: 'READER' }), (error: { httpStatus: number; details?: { priceCoins?: number } }) =>
      error.httpStatus === 402 && error.details?.priceCoins === 15);

    // BUG-002: an unaccented query finds the accented title, "dao" matches "Đạo".
    const search = async (q: string) => {
      const found = await listNovels(listNovelsSchema.parse({ query: { q, limit: 100 } }).query) as unknown;
      const items = (Array.isArray(found) ? found : (found as { items: { novelId: string }[] }).items) as { novelId: string }[];
      return items.some(item => item.novelId === novel);
    };
    assert.equal(await search(`kiem dao ${marker}`), true);
    assert.equal(await search(`Kiếm Đạo ${marker}`), true);
    assert.equal(await search(`kiem ${marker}x`), false);

    // BUG-003: the author changes the age rating; other fields are untouched.
    await updateNovel({ userId: author, role: 'AUTHOR' }, novel, { ageRating: 'MATURE' });
    const row = (await pool.query('select age_rating, title from novels where novel_id = $1', [novel])).rows[0];
    assert.equal(row.age_rating, 'MATURE');
    assert.equal(row.title, `Kiếm Đạo ${marker}`);
    // BUG-007 (round 3): the reader novel page reads /reading/novels/:id, which must carry it too.
    assert.equal((await getReaderNovel(novel) as { ageRating?: string }).ageRating, 'MATURE');
  } finally {
    await pool.query('delete from chapters where novel_id = $1', [novel]);
    await pool.query('delete from novels where novel_id = $1', [novel]);
    await pool.query('delete from users where user_id = any($1::uuid[])', [[author, reader]]);
    await disconnectPostgres();
  }
});
