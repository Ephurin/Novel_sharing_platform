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
    for (const table of ['users', 'user_profiles', 'novels', 'genres', 'tags', 'novel_tags', 'novel_genres', 'chapters', 'bookmarks', 'likes', 'novel_follows', 'novel_ratings', 'notification_events', 'moderation_reviews']) {
      await pool.query(`create table "${table}" (like public."${table}" including all)`);
    }
    await pool.query(await readFile(new URL('../../core/database/migrations/021_novel_notification_subscriptions.sql', import.meta.url), 'utf8'));
    const { searchPublishedNovels, listLatestPublishedChapters, findRandomPublishedNovel, listReadingFilters, findPublishedNovelDetail } = await import('./reading.repository.js');
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
    // UI-18: a tag repeating a genre name (any case) is listed once, as the genre, and the genre filter still finds it.
    const echoTag = randomUUID();
    await pool.query(`insert into genres (name, slug) values ('Cyberpunk', 'cyberpunk-genre')`);
    await pool.query(`insert into tags (tag_id, name, slug) values ($1, 'cyberpunk', 'cyberpunk')`, [echoTag]);
    await pool.query(`insert into novel_tags (novel_id, tag_id) values ($1, $2)`, [ids[2], echoTag]);
    assert.deepEqual(await listReadingFilters(), { genres: ['Cyberpunk', 'Secondary genre'], tags: ['Adventure', 'Magic', 'Unused'] });
    assert.deepEqual((await search({ genre: 'Cyberpunk' })).items.map(item => item.novelId), [ids[2]]);
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
    const secondGenre = randomUUID();
    await pool.query(`insert into genres (genre_id, name, slug) values ($1, 'Fantasy', 'fantasy')`, [secondGenre]);
    await pool.query(`insert into novel_genres (novel_id, genre_id) values ($1, $3), ($2, $3)`, [ids[0], ids[1], secondGenre]);
    const combined = await search({ genres: ['Secondary genre', 'Fantasy'], tags: ['Adventure', 'Magic'] });
    assert.equal(combined.totalItems, 1);
    assert.deepEqual(combined.items.map(item => item.novelId), [ids[0]]);
    assert.equal((await search({ genres: ['Secondary genre', 'missing'] })).totalItems, 0);
    assert.equal((await search({ tags: ['Magic', 'Unused'] })).totalItems, 0);
    assert.equal((await search({ genre: 'Secondary genre', genres: ['FANTASY'], tags: ['magic', 'Magic'] })).totalItems, 1);
    await pool.query(`update chapters set updated_at = '2026-10-01T12:00:00Z' where novel_id = $1 and chapter_number = 1`, [ids[1]]);
    await pool.query(`update chapters set updated_at = '2099-01-01T00:00:00Z' where novel_id = $1 and chapter_number > 1`, [ids[1]]);
    await pool.query(`update novels set updated_at = '2099-01-01T00:00:00Z', author_note = 'A public author note' where novel_id = $1`, [ids[1]]);
    const betaDetail = await findPublishedNovelDetail(ids[1]);
    assert.equal(new Date(betaDetail!.lastUpdatedAt).toISOString(), '2026-10-01T12:00:00.000Z');
    assert.equal(betaDetail!.authorNote, 'A public author note');
    assert.deepEqual((await findPublishedNovelDetail(ids[0]))!.genres, ['Fantasy', 'Secondary genre']);
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

    // Relevance ranking must strictly preserve title tier (exact > prefix > substring > synopsis)
    // even when the prefix novel matches author + genre + tag + synopsis AND has higher views/newer updated_at.
    const [relExact, relPrefix, relSub, relSynopsis] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const relAuthor = randomUUID();
    await pool.query(
      `insert into users (user_id, email, username, password_hash, role)
       values ($1, 'kiem-thanh-author@example.invalid', 'kiem_thanh_author', 'unused', 'AUTHOR')`,
      [relAuthor]
    );
    await pool.query(
      `insert into user_profiles (user_id, display_name) values ($1, 'Tác giả Kiếm Thánh')`,
      [relAuthor]
    );
    const relGenre = randomUUID(), relTag = randomUUID();
    await pool.query(`insert into genres (genre_id, name, slug) values ($1, 'Kiếm Thánh Truyện', 'kiem-thanh-truyen')`, [relGenre]);
    await pool.query(`insert into tags (tag_id, name, slug) values ($1, 'Kiếm Thánh Tag', 'kiem-thanh-tag')`, [relTag]);
    for (const [id, novelAuthor, title, synopsis, views, updatedAt] of [
      [relExact, author, 'Kiếm Thánh', 'Giới thiệu ngắn', 5, '2025-01-01T00:00:00Z'],
      [relPrefix, relAuthor, 'Kiếm Thánh Truyền Kỳ', 'Câu chuyện về Kiếm Thánh mạnh nhất', 50000, '2026-11-19T00:00:00Z'],
      [relSub, author, 'Hành Trình Kiếm Thánh', 'Giới thiệu ngắn', 500, '2026-06-01T00:00:00Z'],
      [relSynopsis, author, 'Câu Chuyện Mùa Thu', 'Nhắc đến Kiếm Thánh huyền thoại', 99999, '2026-11-20T00:00:00Z']
    ] as const) {
      await pool.query(
        `insert into novels (novel_id, author_id, title, slug, synopsis, status, views_count, updated_at)
         values ($1, $2, $3, $4, $5, 'PUBLISHED', $6, $7)`,
        [id, novelAuthor, title, `slug-${id}`, synopsis, views, updatedAt]
      );
    }
    await pool.query(`insert into novel_genres (novel_id, genre_id) values ($1, $2)`, [relPrefix, relGenre]);
    await pool.query(`insert into novel_tags (novel_id, tag_id) values ($1, $2)`, [relPrefix, relTag]);
    const relevance = await search({ q: 'Kiếm Thánh', sort: 'relevance', order: 'desc' });
    assert.deepEqual(relevance.items.map(item => item.novelId), [relExact, relPrefix, relSub, relSynopsis]);
    const relevanceUnaccent = await search({ q: 'kiem thanh', sort: 'relevance', order: 'desc' });
    assert.deepEqual(relevanceUnaccent.items.map(item => item.novelId), [relExact, relPrefix, relSub, relSynopsis]);

    // Free-text query q must also match novels whose keyword only appears in genre or tag.
    const metaOnlyNovel = randomUUID(), uniqueGenre = randomUUID(), uniqueTag = randomUUID();
    await pool.query(`insert into genres (genre_id, name, slug) values ($1, 'Huyền Ảo Cổ Đại', 'huyen-ao-co-dai')`, [uniqueGenre]);
    await pool.query(`insert into tags (tag_id, name, slug) values ($1, 'Nhiệt Huyết Độc Bản', 'nhiet-huyet-doc-ban')`, [uniqueTag]);
    await pool.query(
      `insert into novels (novel_id, author_id, title, slug, synopsis, status)
       values ($1, $2, 'Chuyến Tàu Đêm', $3, 'Một câu chuyện ngắn', 'PUBLISHED')`,
      [metaOnlyNovel, author, `slug-${metaOnlyNovel}`]
    );
    await pool.query(`insert into novel_genres (novel_id, genre_id) values ($1, $2)`, [metaOnlyNovel, uniqueGenre]);
    await pool.query(`insert into novel_tags (novel_id, tag_id) values ($1, $2)`, [metaOnlyNovel, uniqueTag]);
    const byGenreOnly = await search({ q: 'huyen ao co dai', sort: 'relevance', order: 'desc' });
    assert.equal(byGenreOnly.totalItems, 1);
    assert.deepEqual(byGenreOnly.items.map(item => item.novelId), [metaOnlyNovel]);
    const byTagOnly = await search({ q: 'Nhiet Huyet Doc Ban', sort: 'relevance', order: 'desc' });
    assert.equal(byTagOnly.totalItems, 1);
    assert.deepEqual(byTagOnly.items.map(item => item.novelId), [metaOnlyNovel]);

    // Random published novel picker must only return published non-deleted novels.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const picked = await findRandomPublishedNovel();
      assert.ok(picked, 'Expected a published novel');
      assert.notEqual(picked.novelId, ids[3]);
      assert.notEqual(picked.novelId, ids[4]);
    }

    // Reading a chapter (incrementing views) or liking a novel must NOT change updated_at
    // or reorder the 'Mới cập nhật' (sort=updatedAt) listing.
    const { getReaderChapter } = await import('./reading.service.js');
    const { likeNovel } = await import('../interactions/social.repository.js');
    const { publishChapter, touchChapterUpdatedAt } = await import('../novels/chapters.repository.js');
    const [olderNovel, newerNovel] = [randomUUID(), randomUUID()];
    const [olderChapter, newerChapter] = [randomUUID(), randomUUID()];
    const [oldTime, newTime] = ['2026-01-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'];
    await pool.query(
      `insert into novels (novel_id, author_id, title, slug, synopsis, status, views_count, published_at, updated_at, created_at)
       values
         ($1, $3, 'UpdateOrder Older', $4, 'Test', 'PUBLISHED', 0, $6, $6, $6),
         ($2, $3, 'UpdateOrder Newer', $5, 'Test', 'PUBLISHED', 0, $7, $7, $7)`,
      [olderNovel, newerNovel, author, `slug-${olderNovel}`, `slug-${newerNovel}`, oldTime, newTime]
    );
    await pool.query(
      `insert into chapters (chapter_id, novel_id, title, chapter_number, content, word_count, status, published_at, published_updated_at, updated_at, created_at)
       values
         ($1, $3, 'Chap 1', 1, 'Nội dung cũ', 100, 'PUBLISHED', $5, $5, $5, $5),
         ($2, $4, 'Chap 1', 1, 'Nội dung mới', 100, 'PUBLISHED', $6, $6, $6, $6)`,
      [olderChapter, newerChapter, olderNovel, newerNovel, oldTime, newTime]
    );
    await getReaderChapter(olderChapter);
    await likeNovel(reader, olderNovel);
    const olderRow = (await pool.query('select views_count, likes_count, updated_at from novels where novel_id = $1', [olderNovel])).rows[0];
    assert.equal(olderRow.views_count, 1);
    assert.equal(olderRow.likes_count, 1);
    assert.equal(new Date(olderRow.updated_at).toISOString(), oldTime);
    const orderedByUpdated = await search({ q: 'UpdateOrder', sort: 'updatedAt', order: 'desc' });
    assert.deepEqual(orderedByUpdated.items.map(item => item.novelId), [newerNovel, olderNovel]);

    // Saving a private draft of an already-PUBLISHED chapter touches chapters.updated_at,
    // which must NOT move the novel ahead in public 'Mới cập nhật' ordering or detail 'Cập nhật'.
    await touchChapterUpdatedAt(olderChapter);
    const afterDraftSave = await search({ q: 'UpdateOrder', sort: 'updatedAt', order: 'desc' });
    assert.deepEqual(afterDraftSave.items.map(item => item.novelId), [newerNovel, olderNovel]);
    assert.equal(new Date(afterDraftSave.items[1].lastUpdatedAt).toISOString(), oldTime);
    const olderDetailAfterDraft = await findPublishedNovelDetail(olderNovel);
    assert.equal(new Date(olderDetailAfterDraft!.lastUpdatedAt).toISOString(), oldTime);

    // Approving/publishing a revision of that chapter updates published_updated_at, moving the
    // novel to the top and exposing the same fresh lastUpdatedAt/updatedAt in search & detail.
    await publishChapter(olderChapter, { title: 'Chap 1 (đã sửa)', content: 'Nội dung công khai mới', wordCount: 120 });
    const afterPublishRevision = await search({ q: 'UpdateOrder', sort: 'updatedAt', order: 'desc' });
    assert.deepEqual(afterPublishRevision.items.map(item => item.novelId), [olderNovel, newerNovel]);
    assert.ok(Date.parse(afterPublishRevision.items[0].lastUpdatedAt) > Date.parse(newTime));
    assert.equal(
      new Date(afterPublishRevision.items[0].updatedAt).toISOString(),
      new Date(afterPublishRevision.items[0].lastUpdatedAt).toISOString()
    );
    const olderDetailAfterPublish = await findPublishedNovelDetail(olderNovel);
    assert.equal(
      new Date(olderDetailAfterPublish!.lastUpdatedAt).toISOString(),
      new Date(afterPublishRevision.items[0].lastUpdatedAt).toISOString()
    );

    // Migration 037 backfill must preserve the latest APPROVED publication/revision review
    // timestamp (both KEYWORD_FILTER and clean PUBLICATION_REQUEST) instead of regressing
    // to initial published_at, USER_REPORT reviews, or later unapproved draft saves.
    const [backfillKeywordChapter, backfillPubReqChapter] = [randomUUID(), randomUUID()];
    const initialPub = '2026-01-10T00:00:00.000Z';
    const approvedKeywordRev = '2026-03-15T12:00:00.000Z';
    const approvedPubReqRev = '2026-04-10T08:30:00.000Z';
    const laterReport = '2026-05-01T00:00:00.000Z';
    const laterDraft = '2026-06-20T00:00:00.000Z';
    await pool.query(
      `insert into chapters (chapter_id, novel_id, title, chapter_number, content, word_count, status, published_at, published_updated_at, updated_at, created_at)
       values
         ($1, $3, 'Chap backfill keyword', 2, 'Nội dung đã duyệt sửa', 150, 'PUBLISHED', $4, null, $5, $4),
         ($2, $3, 'Chap backfill pubreq', 3, 'Nội dung sửa sạch qua publication request', 180, 'PUBLISHED', $4, null, $5, $4)`,
      [backfillKeywordChapter, backfillPubReqChapter, newerNovel, initialPub, laterDraft]
    );
    await pool.query(
      `insert into moderation_reviews (target_type, target_id, source, status, reviewed_at, updated_at, created_at)
       values
         ('CHAPTER', $1, 'KEYWORD_FILTER', 'APPROVED', $3, $3, $3),
         ('CHAPTER', $1, 'USER_REPORT', 'APPROVED', $5, $5, $5),
         ('CHAPTER', $2, 'PUBLICATION_REQUEST', 'APPROVED', $4, $4, $4),
         ('CHAPTER', $2, 'USER_REPORT', 'APPROVED', $5, $5, $5)`,
      [backfillKeywordChapter, backfillPubReqChapter, approvedKeywordRev, approvedPubReqRev, laterReport]
    );
    await pool.query(await readFile(new URL('../../core/database/migrations/037_chapter_content_published_updated_at.sql', import.meta.url), 'utf8'));
    const keywordRow = (await pool.query('select published_updated_at from chapters where chapter_id = $1', [backfillKeywordChapter])).rows[0];
    assert.equal(new Date(keywordRow.published_updated_at).toISOString(), approvedKeywordRev);
    const pubReqRow = (await pool.query('select published_updated_at from chapters where chapter_id = $1', [backfillPubReqChapter])).rows[0];
    assert.equal(new Date(pubReqRow.published_updated_at).toISOString(), approvedPubReqRev);

    // Latest published chapters must order by chapter published_at desc across novels
    // and include multiple chapters from the same novel while excluding drafts/deleted.
    const [chOld, chMid, chNew, chDraft] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await pool.query(
      `insert into chapters (chapter_id, novel_id, title, chapter_number, word_count, status, published_at)
       values
         ($1, $5, 'Chương cũ hơn', 1, 500, 'PUBLISHED', '2030-01-02T10:00:00Z'),
         ($2, $6, 'Chương ở giữa', 1, 500, 'PUBLISHED', '2030-01-02T15:00:00Z'),
         ($3, $5, 'Chương mới nhất', 2, 500, 'PUBLISHED', '2030-01-03T10:00:00Z'),
         ($4, $5, 'Bản nháp mới hơn', 3, 500, 'DRAFT', '2030-01-05T10:00:00Z')`,
      [chOld, chMid, chNew, chDraft, relExact, relPrefix]
    );
    const latestChapters = await listLatestPublishedChapters(3);
    assert.deepEqual(latestChapters.map(item => item.chapterId), [chNew, chMid, chOld]);
    assert.equal(latestChapters[0].novelTitle, 'Kiếm Thánh');
    assert.equal(latestChapters[1].novelTitle, 'Kiếm Thánh Truyền Kỳ');
  } finally {
    await disconnect?.();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  }
});
