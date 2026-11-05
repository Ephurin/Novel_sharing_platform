import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

test('reader catalog, published metadata and unified follow/library state', {
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
    for (const table of ['users', 'user_profiles', 'novels', 'genres', 'tags', 'novel_tags', 'novel_genres', 'chapters', 'bookmarks', 'likes', 'novel_follows', 'novel_ratings', 'notification_events']) {
      await pool.query(`create table "${table}" (like public."${table}" including all)`);
    }
    await pool.query(await readFile(new URL('../../core/database/migrations/021_novel_notification_subscriptions.sql', import.meta.url), 'utf8'));
    const { searchPublishedNovels, listReadingFilters, findPublishedNovelDetail } = await import('./reading.repository.js');
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
    await pool.query("update novels set serial_status='COMPLETED' where novel_id=$1", [ids[1]]);
    await pool.query("update novels set serial_status='HIATUS' where novel_id=$1", [ids[2]]);
    for (const [status, id] of [['ONGOING', ids[0]], ['COMPLETED', ids[1]], ['HIATUS', ids[2]]]) {
      assert.deepEqual((await search({ status })).items.map(item => item.novelId), [id]);
    }
    assert.equal((await search({ genre: 'Secondary genre', status: 'COMPLETED' })).totalItems, 0);
    const filtered = await search({ genre: 'Secondary genre', tag: 'Magic' });
    assert.equal(filtered.totalItems, 1);
    assert.equal(filtered.items[0].novelId, ids[0]);
    assert.deepEqual(filtered.items[0].tags, ['Adventure', 'Magic']);
    assert.equal((await search({ tag: 'Unused' })).items.length, 0);
    await pool.query(`update chapters set updated_at = '2026-10-01T12:00:00Z' where novel_id = $1 and chapter_number = 1`, [ids[1]]);
    await pool.query(`update chapters set updated_at = '2099-01-01T00:00:00Z' where novel_id = $1 and chapter_number > 1`, [ids[1]]);
    await pool.query(`update novels set updated_at = '2099-01-01T00:00:00Z', author_note = 'A public author note' where novel_id = $1`, [ids[1]]);
    const betaDetail = await findPublishedNovelDetail(ids[1]);
    assert.equal(new Date(betaDetail!.lastUpdatedAt).toISOString(), '2026-10-01T12:00:00.000Z');
    assert.equal(betaDetail!.authorNote, 'A public author note');
    assert.deepEqual((await findPublishedNovelDetail(ids[0]))!.genres, ['Secondary genre']);
    assert.equal(await findPublishedNovelDetail(ids[3]), null);
    assert.equal(await findPublishedNovelDetail(ids[4]), null);
    const reader = randomUUID(), other = randomUUID();
    for (const id of [reader, other]) await pool.query(`insert into users (user_id,email,username,password_hash,role)
      values ($1::uuid,$2,$1::text,'unused','READER')`, [id, `${id}@example.invalid`]);
    await pool.query('insert into bookmarks (novel_id,user_id) values ($1,$2)', [ids[0], reader]);
    await pool.query('insert into likes (novel_id,user_id) values ($1,$2)', [ids[1], reader]);
    await pool.query('update novels set likes_count = 1 where novel_id = $1', [ids[1]]);
    await pool.query('insert into novel_follows (novel_id,user_id) values ($1,$2)', [ids[2], reader]);
    const { getNovelStatistics, setNovelFollow } = await import('../interactions/novel-engagement.repository.js');
    const { listBookmarks, removeBookmark } = await import('./reading.repository.js');
    const library = () => listBookmarks(reader, { page: 1, limit: 20 });
    assert.equal((await library()).totalItems, 3);
    for (const novelId of ids.slice(0, 3)) assert.equal((await getNovelStatistics(novelId, reader)).isFollowing, true);
    await Promise.all([setNovelFollow(ids[0], reader, true), setNovelFollow(ids[0], reader, true)]);
    assert.equal((await getNovelStatistics(ids[0], reader)).followersCount, 1);
    assert.equal((await library()).totalItems, 3);
    assert.equal((await pool.query("select count(*)::int as count from notification_events where type = 'NOVEL_FOLLOW'")).rows[0].count, 1);
    await pool.query('insert into likes (novel_id,user_id) values ($1,$2)', [ids[0], reader]);
    await pool.query('insert into novel_follows (novel_id,user_id) values ($1,$2)', [ids[0], other]);
    await setNovelFollow(ids[0], reader, false);
    assert.equal((await getNovelStatistics(ids[0], reader)).isFollowing, false);
    assert.equal((await getNovelStatistics(ids[0], other)).isFollowing, true);
    assert.equal((await library()).totalItems, 2);
    assert.equal(await removeBookmark(reader, ids[1]), true);
    await setNovelFollow(ids[1], reader, false);
    assert.equal((await pool.query('select likes_count from novels where novel_id = $1', [ids[1]])).rows[0].likes_count, 0);
    assert.equal((await getNovelStatistics(ids[1], reader)).isFollowing, false);
    await pool.query(`create function reject_reader_follow_event() returns trigger language plpgsql as $$
      begin raise exception 'Simulated notification failure'; end $$`);
    await pool.query(`create trigger reject_reader_follow before insert on notification_events
      for each row execute function reject_reader_follow_event()`);
    await assert.rejects(() => setNovelFollow(ids[1], reader, true), /Simulated notification failure/);
    assert.equal((await getNovelStatistics(ids[1], reader)).isFollowing, false);
    assert.equal((await pool.query('select count(*)::int as count from bookmarks where novel_id=$1 and user_id=$2', [ids[1], reader])).rows[0].count, 0);
    await pool.query('drop trigger reject_reader_follow on notification_events');
    await Promise.all([setNovelFollow(ids[1], reader, true), setNovelFollow(ids[1], reader, false)]);
    const membership = (await pool.query(`select
      exists(select 1 from bookmarks where novel_id=$1 and user_id=$2) as saved,
      exists(select 1 from novel_follows where novel_id=$1 and user_id=$2) as followed`, [ids[1], reader])).rows[0];
    assert.equal(membership.saved, membership.followed);
    const { novelRatingSchema } = await import('../interactions/novel-engagement.routes.js');
    for (const score of [1, 10]) assert.equal(novelRatingSchema.safeParse({ params: { novelId: ids[0] }, body: { score } }).success, true);
    for (const score of [0, 11, 9.5]) assert.equal(novelRatingSchema.safeParse({ params: { novelId: ids[0] }, body: { score } }).success, false);
    const { updateNovelEngagement } = await import('../interactions/novel-engagement.service.js');
    const { setNovelNotifications } = await import('../interactions/novel-engagement.repository.js');
    const readerAuth = { userId: reader, role: 'READER' as const };
    assert.equal((await updateNovelEngagement(readerAuth, ids[0], { notificationsEnabled: true })).notificationsEnabled, true);
    assert.equal((await getNovelStatistics(ids[0], other)).notificationsEnabled, false);
    assert.equal((await getNovelStatistics(ids[0], reader)).isFollowing, false);
    const chapterEvents = async () => (await pool.query("select * from notification_events where type='NOVEL_CHAPTER_PUBLISHED'")).rows;
    const newChapter = async (number: number) => {
      const id = randomUUID();
      await pool.query(`insert into chapters (chapter_id,novel_id,title,chapter_number,content,word_count)
        values ($1,$2,'New chapter',$3,'Published text',100)`, [id,ids[0],number]);
      return id;
    };
    const publish = (id: string) => pool.query("update chapters set status='PUBLISHED',published_at=now() where chapter_id=$1", [id]);
    const firstNew = await newChapter(3);
    await publish(firstNew);
    assert.equal((await chapterEvents()).length, 1);
    assert.equal((await chapterEvents())[0].user_id, reader);
    assert.equal((await chapterEvents())[0].payload.href, `/reader/chapters/${firstNew}`);
    await publish(firstNew);
    assert.equal((await chapterEvents()).length, 1);
    await setNovelNotifications(ids[0], reader, false);
    assert.equal((await chapterEvents()).length, 0);
    await publish(await newChapter(4));
    assert.equal((await chapterEvents()).length, 0);
    await setNovelNotifications(ids[0], other, true);
    await publish(await newChapter(5));
    assert.equal((await chapterEvents())[0].user_id, other);
    await pool.query("update users set status='LOCKED' where user_id=$1", [other]);
    await publish(await newChapter(6));
    assert.equal((await chapterEvents()).length, 1);
    await setNovelNotifications(ids[0], other, false);
    await setNovelNotifications(ids[0], reader, true);
    const rollbackChapter = await newChapter(7);
    const { withPostgresTransaction } = await import('../../core/database/transaction.js');
    await assert.rejects(withPostgresTransaction(async client => {
      await client.query("update chapters set status='PUBLISHED',published_at=now() where chapter_id=$1", [rollbackChapter]);
      throw new Error('Publication rollback');
    }), /Publication rollback/);
    assert.equal((await chapterEvents()).length, 0);
    assert.equal((await pool.query('select status from chapters where chapter_id=$1', [rollbackChapter])).rows[0].status, 'DRAFT');
    await assert.rejects(updateNovelEngagement({ userId: author, role: 'READER' }, ids[0], { notificationsEnabled: true }), { httpStatus: 403 });
    await assert.rejects(updateNovelEngagement(readerAuth, ids[3], { notificationsEnabled: true }), { httpStatus: 404 });
  } finally {
    await disconnect?.();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  }
});
