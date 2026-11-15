import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const expected = process.env.EPHURIN_EXPECTED_TEST_DB ?? '';
const isolated = expected.startsWith('ephurin_test_') && process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' &&
  new URL(process.env.DATABASE_URL ?? 'postgres://localhost/disabled').pathname === `/${expected}`;

test('chapter reads record successful access, preserve skipped chapters and isolate accounts', { skip: !isolated }, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { listReadChapterIds } = await import('./reading.repository.js');
  const { getReaderChapter, syncHistory, getHistoryForNovel, listHistory } = await import('./reading.service.js');
  const pool = getPostgresPool();
  const author = randomUUID(), reader = randomUUID(), other = randomUUID(), novel = randomUUID();
  const ids = Array.from({ length: 5 }, () => randomUUID());
  try {
    for (const [id, role] of [[author, 'AUTHOR'], [reader, 'READER'], [other, 'READER']]) {
      await pool.query(`insert into users (user_id, email, username, password_hash, role, status) values ($1::uuid, $2, $1::text, 'unused', $3, 'ACTIVE')`, [id, `${id}@example.invalid`, role]);
    }
    await pool.query(`insert into novels (novel_id, author_id, title, slug, synopsis, status) values ($1::uuid, $2, 'Read flags', $1::text, 'Read flags fixture', 'PUBLISHED')`, [novel, author]);
    for (const [index, id] of ids.entries()) {
      await pool.query(`insert into chapters (chapter_id, novel_id, chapter_number, title, status, is_vip, price_coins) values ($1, $2, $3, 'Chapter', $4, $5, $6)`, [id, novel, index + 1, index === 4 ? 'DRAFT' : 'PUBLISHED', index === 3, index === 3 ? 10 : 0]);
    }
    const auth = { userId: reader, role: 'READER' as const };
    await getReaderChapter(ids[0], auth);
    await getReaderChapter(ids[2], auth);
    await getReaderChapter(ids[0], auth);
    await assert.rejects(getReaderChapter(ids[3], auth), error => (error as { httpStatus: number }).httpStatus === 402);
    await assert.rejects(getReaderChapter(ids[4], auth));
    assert.deepEqual((await listReadChapterIds(reader, novel)).sort(), [ids[0], ids[2]].sort());
    assert.deepEqual(await listReadChapterIds(other, novel), []);
    await syncHistory(auth, { novelId: novel, chapterId: ids[2], paragraphIndex: 0 });
    const before = await getHistoryForNovel(auth, novel);
    await assert.rejects(syncHistory(auth, { novelId: novel, chapterId: ids[3], paragraphIndex: 42 }), { httpStatus: 402 });
    assert.deepEqual(await getHistoryForNovel(auth, novel), before, 'Locked VIP sync must not change the previous position or read flags');
    await assert.rejects(syncHistory({ userId: other, role: 'READER' }, { novelId: novel, chapterId: ids[3], paragraphIndex: 0 }), { httpStatus: 402 });
    await assert.rejects(getHistoryForNovel({ userId: other, role: 'READER' }, novel), { httpStatus: 404 });
    assert.deepEqual((await listHistory(auth, { page: 1, limit: 20 })).data[0].readChapterIds.sort(), [ids[0], ids[2]].sort());
    await pool.query("update users set status = 'LOCKED' where user_id = $1", [reader]);
    await assert.rejects(syncHistory(auth, { novelId: novel, chapterId: ids[0], paragraphIndex: 0 }), { httpStatus: 403 });
    await assert.rejects(getReaderChapter(ids[0], auth), { httpStatus: 403 });
    assert.deepEqual(await getHistoryForNovel(auth, novel), before);
    await pool.query("update users set status = 'ACTIVE' where user_id = $1", [reader]);
    const wallet = (await pool.query('insert into wallets (user_id) values ($1) on conflict (user_id) do update set user_id = excluded.user_id returning wallet_id', [reader])).rows[0].wallet_id;
    const tx = (await pool.query("insert into transactions (wallet_id, type, status, amount_coins) values ($1, 'UNLOCK', 'SUCCESS', 10) returning transaction_id", [wallet])).rows[0].transaction_id;
    await pool.query('insert into chapter_unlocks (user_id, chapter_id, transaction_id) values ($1, $2, $3)', [reader, ids[3], tx]);
    await syncHistory(auth, { novelId: novel, chapterId: ids[3], paragraphIndex: 0 });
    assert.deepEqual((await getHistoryForNovel(auth, novel)).readChapterIds.sort(), [ids[0], ids[2]].sort(), 'Even entitled resume writes are not evidence of a content GET');
    await getReaderChapter(ids[3], auth);
    assert.deepEqual((await listReadChapterIds(reader, novel)).sort(), [ids[0], ids[2], ids[3]].sort());
    await getReaderChapter(ids[1], { userId: other, role: 'READER' });
    assert.deepEqual(await listReadChapterIds(other, novel), [ids[1]]);
    await syncHistory({ userId: other, role: 'READER' }, { novelId: novel, chapterId: ids[1], paragraphIndex: 0 });
    await pool.query('delete from chapter_reads where user_id = $1', [other]);
    await pool.query(await readFile(new URL('../../core/database/migrations/022_chapter_reads.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await listReadChapterIds(other, novel), [], 'Resume history must not be backfilled as proof of a read');
    await pool.query('insert into chapter_reads (user_id, novel_id, chapter_id) values ($1, $2, $3)', [other, novel, ids[1]]);
    await pool.query(await readFile(new URL('../../core/database/migrations/023_verified_chapter_reads.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await listReadChapterIds(other, novel), [], 'Rows seeded by earlier builds remain unverified');
    await getReaderChapter(ids[1], { userId: other, role: 'READER' });
    assert.deepEqual(await listReadChapterIds(other, novel), [ids[1]]);
    assert.deepEqual((await listReadChapterIds(reader, novel)).sort(), [ids[0], ids[2], ids[3]].sort());
  } finally {
    await pool.query('delete from novels where novel_id = $1', [novel]);
    await pool.query('delete from transactions where wallet_id in (select wallet_id from wallets where user_id = any($1::uuid[]))', [[author, reader, other]]);
    await pool.query('delete from users where user_id = any($1::uuid[])', [[author, reader, other]]);
    await disconnectPostgres();
  }
});
