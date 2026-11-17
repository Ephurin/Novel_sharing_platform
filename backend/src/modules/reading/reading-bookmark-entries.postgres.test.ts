import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const expected = process.env.EPHURIN_EXPECTED_TEST_DB ?? '';
const isolated = expected.startsWith('ephurin_test_') && process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS === '1' &&
  new URL(process.env.DATABASE_URL ?? 'postgres://localhost/disabled').pathname === `/${expected}`;

test('multiple reading bookmarks preserve legacy positions, pagination, account isolation and chapter access', { skip: !isolated }, async () => {
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  const { listReadingBookmarkEntries, saveReadingBookmarkEntry, removeReadingBookmarkEntry, saveReadingBookmark } = await import('./reading.service.js');
  const { bookmarkEntrySchema, bookmarkEntriesSchema } = await import('./reading.schemas.js');
  const { findReadingHistory, listReadChapterIds } = await import('./reading.repository.js');
  const pool = getPostgresPool();
  const author = randomUUID(), reader = randomUUID(), other = randomUUID(), novel = randomUUID();
  const chapters = [randomUUID(), randomUUID(), randomUUID()];
  const auth = { userId: reader, role: 'READER' as const }, otherAuth = { userId: other, role: 'READER' as const };
  const query = { page: 1, limit: 50 };
  try {
    for (const [id, role] of [[author, 'AUTHOR'], [reader, 'READER'], [other, 'READER']]) {
      await pool.query(`insert into users(user_id,email,username,password_hash,role,status) values($1::uuid,$2,$1::text,'unused',$3,'ACTIVE')`, [id, id + '@example.invalid', role]);
    }
    await pool.query(`insert into novels(novel_id,author_id,title,slug,synopsis,status) values($1::uuid,$2,'Bookmark fixture',$1::text,'Fixture','PUBLISHED')`, [novel, author]);
    for (const [index, id] of chapters.entries()) await pool.query(`insert into chapters(chapter_id,novel_id,chapter_number,title,status,is_vip,price_coins)
      values($1,$2,$3,'Chapter',$4,$5,$6)`, [id, novel, index + 1, index === 2 ? 'DRAFT' : 'PUBLISHED', index === 1, index === 1 ? 10 : 0]);

    await saveReadingBookmark(auth, novel, { chapterId: chapters[0], paragraphIndex: 3, pageOffset: .25 });
    await pool.query(await readFile(new URL('../../core/database/migrations/026_reading_bookmark_entries.sql', import.meta.url), 'utf8'));
    let list = await listReadingBookmarkEntries(auth, query);
    assert.equal(list.meta.totalItems, 1);
    assert.equal(list.data[0].paragraphIndex, 3);
    assert.equal(list.data[0].pageOffset, .25);
    assert.equal(list.data[0].novelTitle, 'Bookmark fixture');
    const input = { novelId: novel, chapterId: chapters[0], paragraphIndex: 7, pageOffset: .4, excerpt: 'A saved passage' };
    const first = await saveReadingBookmarkEntry(auth, input);
    await saveReadingBookmarkEntry(auth, { ...input, paragraphIndex: 9 });
    const repeated = await saveReadingBookmarkEntry(auth, { ...input, excerpt: 'Updated passage' });
    assert.equal(repeated.bookmarkId, first.bookmarkId);
    list = await listReadingBookmarkEntries(auth, query);
    assert.equal(list.meta.totalItems, 3);
    assert.equal(list.data.find(item => item.bookmarkId === first.bookmarkId)?.excerpt, 'Updated passage');
    const secondLine = { ...input, startOffset: 20, endOffset: 40, excerpt: 'A separate rendered line' };
    const lineBookmark = await saveReadingBookmarkEntry(auth, secondLine);
    assert.notEqual(lineBookmark.bookmarkId, first.bookmarkId);
    assert.equal((await saveReadingBookmarkEntry(auth, secondLine)).bookmarkId, lineBookmark.bookmarkId);
    const lineItems = await listReadingBookmarkEntries(auth, query);
    assert.equal(lineItems.meta.totalItems, 4, 'Two lines in one paragraph are saved independently');
    assert.equal(lineItems.data.find(item => item.bookmarkId === lineBookmark.bookmarkId)?.startOffset, 20);
    assert.equal(lineItems.data.find(item => item.bookmarkId === lineBookmark.bookmarkId)?.endOffset, 40);
    await removeReadingBookmarkEntry(auth, lineBookmark.bookmarkId);
    const page1 = await listReadingBookmarkEntries(auth, { page: 1, limit: 1 });
    const page2 = await listReadingBookmarkEntries(auth, { page: 2, limit: 1 });
    assert.equal(page1.meta.totalPages, 3);
    assert.notEqual(page1.data[0].bookmarkId, page2.data[0].bookmarkId);
    assert.equal((await listReadingBookmarkEntries(auth, { ...query, novelId: randomUUID() })).meta.totalItems, 0);
    assert.equal((await listReadingBookmarkEntries(otherAuth, query)).meta.totalItems, 0);
    await assert.rejects(removeReadingBookmarkEntry(otherAuth, first.bookmarkId), { httpStatus: 404 });
    await assert.rejects(saveReadingBookmarkEntry(auth, { ...input, chapterId: chapters[1] }), { httpStatus: 402 });
    await assert.rejects(saveReadingBookmarkEntry(auth, { ...input, chapterId: chapters[2] }), { httpStatus: 404 });
    await assert.rejects(saveReadingBookmarkEntry(auth, { ...input, novelId: randomUUID() }), { httpStatus: 404 });
    const authorAuth = { userId: author, role: 'AUTHOR' as const };
    await saveReadingBookmarkEntry(authorAuth, { ...input, chapterId: chapters[1] });
    assert.equal((await listReadingBookmarkEntries(authorAuth, query)).meta.totalItems, 1);
    const walletId = (await pool.query('insert into wallets(user_id) values($1) returning wallet_id', [reader])).rows[0].wallet_id;
    const transactionId = (await pool.query("insert into transactions(wallet_id,type,status,amount_coins) values($1,'UNLOCK','SUCCESS',10) returning transaction_id", [walletId])).rows[0].transaction_id;
    await pool.query('insert into chapter_unlocks(user_id,chapter_id,transaction_id) values($1,$2,$3)', [reader, chapters[1], transactionId]);
    await saveReadingBookmarkEntry(auth, { ...input, chapterId: chapters[1], excerpt: 'VIP excerpt' });
    assert.equal((await listReadingBookmarkEntries(auth, query)).meta.totalItems, 4);
    await pool.query('delete from chapter_unlocks where user_id=$1', [reader]);
    assert.equal((await listReadingBookmarkEntries(auth, query)).meta.totalItems, 3, 'Private excerpts are hidden if chapter access is lost');
    await pool.query("update chapters set status='DRAFT' where chapter_id=$1", [chapters[0]]);
    assert.equal((await listReadingBookmarkEntries(auth, query)).meta.totalItems, 0);
    await pool.query("update chapters set status='PUBLISHED' where chapter_id=$1", [chapters[0]]);
    await pool.query("update users set status='LOCKED' where user_id=$1", [reader]);
    await assert.rejects(listReadingBookmarkEntries(auth, query), { httpStatus: 403 });
    await assert.rejects(saveReadingBookmarkEntry(auth, input), { httpStatus: 403 });
    await assert.rejects(removeReadingBookmarkEntry(auth, first.bookmarkId), { httpStatus: 403 });
    await pool.query("update users set status='ACTIVE' where user_id=$1", [reader]);
    await removeReadingBookmarkEntry(auth, first.bookmarkId);
    assert.equal((await listReadingBookmarkEntries(auth, query)).meta.totalItems, 2);
    assert.deepEqual(await listReadChapterIds(reader, novel), []);
    assert.equal(await findReadingHistory(reader, novel), null);
    assert.throws(() => bookmarkEntrySchema.parse({ body: { ...input, excerpt: 'x'.repeat(501) } }));
    assert.throws(() => bookmarkEntrySchema.parse({ body: { ...input, paragraphIndex: -1 } }));
    assert.throws(() => bookmarkEntrySchema.parse({ body: { ...input, startOffset: 40, endOffset: 20 } }));
    assert.throws(() => bookmarkEntriesSchema.parse({ query: { limit: 101 } }));
  } finally {
    await pool.query('delete from novels where novel_id=$1', [novel]);
    await pool.query('delete from transactions where wallet_id in (select wallet_id from wallets where user_id=$1)', [reader]);
    await pool.query('delete from users where user_id=any($1::uuid[])', [[author, reader, other]]);
    await disconnectPostgres();
  }
});
