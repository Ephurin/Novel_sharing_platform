import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Opt in: this test creates and removes its own schema, never application rows.
test('author ledger, public profile and project summaries', {
  skip: process.env.RUN_AUTHOR_DATA_TESTS !== '1'
}, async () => {
  const schema = `author_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  let disconnect: (() => Promise<void>) | undefined;
  let created = false;
  try {
    await admin.query(`create schema "${schema}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('options', `-csearch_path=${schema},public -ctimezone=UTC`);
    process.env.DATABASE_URL = url.href;
    const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
    disconnect = disconnectPostgres;
    const pool = getPostgresPool();
    for (const name of ['001_auth_user_wallet', '002_novels', '003_chapters', '004_content_control', '005_reports_description', '006_reading_interactions', '007_wallet_transactions', '012_reports_unique_open','012_novel_engagement', '013_novel_review_text', '014_novel_editorial_metadata','015_author_workflow','016_author_launch_checklist']) {
      const sql = await readFile(new URL(`../../core/database/migrations/${name}.sql`, import.meta.url), 'utf8');
      await pool.query(sql);
    }
    const wallet = await import('./wallet.repository.js');
    const users = await import('../users/users.repository.js');
    const novels = await import('../novels/novels.repository.js');
    const { unlockVipChapter } = await import('./wallet.service.js');
    const author = randomUUID(), reader = randomUUID(), stranger = randomUUID();
    for (const [id, role] of [[author, 'AUTHOR'], [reader, 'READER'], [stranger, 'AUTHOR']]) {
      await pool.query(`insert into users (user_id, email, username, role) values ($1::uuid, $2, $1::text, $3)`, [id, `${id}@test.invalid`, role]);
      await pool.query('insert into user_profiles (user_id) values ($1)', [id]);
      await pool.query('insert into wallets (user_id) values ($1)', [id]);
    }
    const genre = (await pool.query("insert into genres (name, slug) values ('Fantasy', 'fantasy') returning genre_id")).rows[0].genre_id;
    const novel = (await pool.query(`insert into novels (author_id, title, slug, synopsis, status, views_count, genre_id, cover_image_url)
      values ($1, 'Published', 'published', 'Synopsis', 'PUBLISHED', 123, $2, 'https://example.com/cover.jpg') returning novel_id`, [author, genre])).rows[0].novel_id;
    const chapter = (await pool.query(`insert into chapters (novel_id, title, chapter_number, word_count, status, is_vip, price_coins)
      values ($1, 'Published chapter', 1, 500, 'PUBLISHED', true, 40) returning *`, [novel])).rows[0];
    await pool.query(`insert into chapters (novel_id, title, chapter_number, word_count, status, updated_at)
      values ($1, 'Private draft', 2, 900, 'DRAFT', now() + interval '1 minute')`, [novel]);
    await pool.query(`insert into novels (author_id, title, slug, synopsis, views_count) values ($1, 'Private', 'private', 'Synopsis', 999)`, [author]);
    await pool.query('insert into follows (follower_id, author_id) values ($1, $2)', [reader, author]);

    const deposit = await wallet.createDepositSession(reader, { packageCode: 'COIN_1000' });
    await wallet.completeDepositSession(deposit!.depositSessionId);
    await wallet.unlockChapter(reader, { ...chapter, author_id: author });
    const repeated = await wallet.unlockChapter(reader, { ...chapter, author_id: author });
    assert.equal(repeated && repeated.alreadyUnlocked, true);
    await wallet.donateToAuthor(reader, author, { amountCoins: 160, message: 'Thanks' });
    const ownUnlock = await unlockVipChapter({ userId: author, role: 'AUTHOR' }, chapter.chapter_id);
    assert.equal(ownUnlock.transactionId, null);

    const incoming = await wallet.listTransactions(author, { page: 1, limit: 100 });
    assert.equal(incoming.totalItems, 2);
    assert.ok(incoming.items.every(tx => tx.direction === 'IN'));
    const outgoing = await wallet.listTransactions(reader, { page: 1, limit: 100 });
    assert.equal(outgoing.items.filter(tx => tx.direction === 'OUT').length, 2);
    assert.equal(outgoing.items.find(tx => tx.type === 'DEPOSIT')?.direction, 'IN');
    assert.equal((await wallet.findWalletByUserId(reader))?.coinsBalance, 800);
    assert.equal((await wallet.findWalletByUserId(author))?.coinsBalance, 200);
    assert.equal((await wallet.listTransactions(stranger, { page: 1, limit: 100 })).totalItems, 0);
    const filtered = await wallet.listTransactions(author, { page: 1, limit: 1, type: 'DONATE', status: 'SUCCESS' });
    assert.equal(filtered.totalItems, 1);
    assert.equal(filtered.items[0].amountCoins, 160);

    const withdrawal = await wallet.createWithdrawRequest(author, { amountCoins: 100, bankAccountLabel: 'Demo destination' });
    assert.ok(withdrawal);
    assert.equal((await wallet.findWalletByUserId(author))?.lockedCoins, 100);
    await wallet.rejectWithdrawRequest(withdrawal.withdrawRequestId, author, 'Demo rejection');
    const balance = await wallet.findWalletByUserId(author);
    assert.equal(balance?.coinsBalance, 200);
    assert.equal(balance?.lockedCoins, 0);
    const ledger = await wallet.listTransactions(author, { page: 1, limit: 100 });
    assert.equal(ledger.items.find(tx => tx.type === 'WITHDRAW')?.balanceChangeCoins, 0);
    assert.equal(ledger.items.reduce((sum, tx) => sum + tx.balanceChangeCoins, 0), balance?.coinsBalance);
    assert.equal(ledger.items.filter(tx => tx.status === 'SUCCESS').reduce((sum, tx) => sum + (tx.direction === 'IN' ? tx.amountCoins : -tx.amountCoins), 0), balance?.coinsBalance);
    const approved = await wallet.createWithdrawRequest(author, { amountCoins: 100, bankAccountLabel: 'Demo destination' });
    assert.ok(approved);
    const pendingLedger = await wallet.listTransactions(author, { page: 1, limit: 100, status: 'PENDING' });
    assert.equal(pendingLedger.items[0].balanceChangeCoins, -100);
    await wallet.approveWithdrawRequest(approved.withdrawRequestId, author);
    assert.equal((await wallet.findWalletByUserId(author))?.coinsBalance, 100);
    assert.equal((await wallet.findWalletByUserId(author))?.lockedCoins, 0);
    await pool.query(`insert into transactions (wallet_id, counterparty_wallet_id, type, status, amount_coins)
      select sender.wallet_id, receiver.wallet_id, 'DONATE', state::transaction_status, 50
      from wallets sender cross join wallets receiver cross join unnest(array['PENDING', 'FAILED']) state
      where sender.user_id = $1 and receiver.user_id = $2`, [reader, author]);
    const unsuccessful = await wallet.listTransactions(author, { page: 1, limit: 100, type: 'DONATE', status: 'PENDING' });
    assert.equal(unsuccessful.items[0].balanceChangeCoins, 0);

    // 23:30 UTC belongs to the next day in Vietnam, regardless of DB timezone.
    await pool.query(`update transactions set created_at =
      (((now() at time zone 'Asia/Bangkok')::date - 1) + time '23:30') at time zone 'UTC'
      where type = 'DONATE'`);
    const earnings = await wallet.getAuthorEarnings(author);
    assert.equal(earnings.totalEarnedCoins, 200);
    assert.match(earnings.asOfDay, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(earnings.daily.find(day => day.day === earnings.asOfDay)?.donateCoins, 160);
    assert.equal((await wallet.getAuthorEarnings(reader)).totalEarnedCoins, 0);
    assert.equal(await novels.getNovelUnlockEarnings(novel), 40);
    await pool.query(`update transactions set created_at = now() - interval '800 days' where type = 'DONATE'`);
    const historical = await wallet.getAuthorEarnings(author);
    assert.equal(historical.totalEarnedCoins, 200);
    assert.equal(historical.daily.reduce((sum, day) => sum + day.donateCoins, 0), 0);

    const profile = await users.findAuthorProfileById(author, reader);
    assert.equal(profile?.isFollowing, true);
    assert.equal(profile?.followersCount, 1);
    assert.equal(profile?.totalViews, 123);
    assert.equal(profile?.totalWords, 500);
    assert.equal(profile?.novels.length, 1);
    assert.equal(profile?.novels[0].genre, 'Fantasy');
    assert.equal(profile?.novels[0].coverImageUrl, 'https://example.com/cover.jpg');
    assert.ok(profile?.joinedAt);
    assert.equal((await users.findAuthorProfileById(author))?.isFollowing, false);
    const projects = await novels.listNovelsByAuthor(author, { page: 1, limit: 100 });
    const project = projects.items.find(item => item.novelId === novel);
    assert.equal(project?.genreId, genre);
    assert.equal(project?.latestChapter?.title, 'Private draft');
    assert.equal(project?.latestChapter?.chapterNumber, 2);
    assert.equal(projects.items.find(item => item.title === 'Private')?.latestChapter, null);
    assert.equal((await novels.findNovelById(novel))?.latestChapter, undefined);
    const updated = await novels.updateNovel(novel, { title: 'New title' });
    assert.equal(updated?.genre, 'Fantasy');
    assert.equal(updated?.coverImageUrl, 'https://example.com/cover.jpg');
    const changed = await novels.updateNovel(novel, { genre: 'Romance', coverImageUrl: null });
    assert.equal(changed?.genre, 'Romance');
    assert.equal(changed?.coverImageUrl, null);
    assert.equal((await novels.updateNovel(novel, { genre: null }))?.genreId, null);
    const { updateNovel: editNovel, createNovel: createNovelService } = await import('../novels/novels.service.js');
    const editor = { userId: author, role: 'AUTHOR' as const };
    const savedMetadata = await editNovel(editor, novel, { authorNote: 'A note for readers.\nSecond paragraph.', genres: ['Fantasy', 'Adventure'] });
    assert.deepEqual(savedMetadata.genres, ['Fantasy', 'Adventure']);
    assert.equal(savedMetadata.genre, 'Fantasy');
    assert.equal(savedMetadata.authorNote, 'A note for readers.\nSecond paragraph.');
    const titleOnly = await editNovel(editor, novel, { title: 'New metadata title' });
    assert.deepEqual(titleOnly.genres, ['Fantasy', 'Adventure']);
    assert.equal(titleOnly.authorNote, savedMetadata.authorNote);
    assert.deepEqual((await novels.findNovelById(novel))?.genres, ['Fantasy', 'Adventure']);
    await assert.rejects(editNovel({ userId: stranger, role: 'AUTHOR' }, novel, { authorNote: 'Not mine' }), { httpStatus: 403 });
    const createdMetadata = await createNovelService(editor, {
      title: 'Metadata creation fixture', synopsis: 'A sufficiently long introduction.',
      authorNote: 'Created with a note', genres: ['Fantasy', 'Adventure'], tags: []
    });
    assert.equal(createdMetadata.authorNote, 'Created with a note');
    assert.deepEqual(createdMetadata.genres, ['Fantasy', 'Adventure']);
    assert.equal(createdMetadata.genre, 'Fantasy');
    const { updateNovelSchema } = await import('../novels/novels.schemas.js');
    assert.equal(updateNovelSchema.safeParse({ params: { novelId: novel }, body: { authorNote: 'x'.repeat(5001) } }).success, false);
    assert.equal(updateNovelSchema.safeParse({ params: { novelId: novel }, body: { genres: ['a', 'b', 'c', 'd', 'e', 'f'] } }).success, false);
    const clearedMetadata = await editNovel(editor, createdMetadata.novelId, { authorNote: null, genres: [] });
    assert.equal(clearedMetadata.authorNote, null);
    assert.deepEqual(clearedMetadata.genres, []);
    assert.equal(clearedMetadata.genreId, null);
    const { touchChapterUpdatedAt } = await import('../novels/chapters.repository.js');
    await pool.query("update chapters set updated_at = now() - interval '1 day' where novel_id = $1", [novel]);
    await touchChapterUpdatedAt(chapter.chapter_id);
    const active = await novels.listNovelsByAuthor(author, { page: 1, limit: 100 });
    assert.equal(active.items.find(item => item.novelId === novel)?.latestChapter?.chapterId, chapter.chapter_id);

    const { readNovelStatistics, readNovelReviews, updateNovelEngagement } = await import('../interactions/novel-engagement.service.js');
    const { novelRatingSchema } = await import('../interactions/novel-engagement.routes.js');
    const readerAuth = { userId: reader, role: 'READER' as const };
    const authorAuth = { userId: author, role: 'AUTHOR' as const };
    const otherAuth = { userId: stranger, role: 'READER' as const };
    // A signed reader claim alone does not grant access to an author account.
    await assert.rejects(updateNovelEngagement(otherAuth, novel, { score: 7 }), { httpStatus: 403 });
    await pool.query("update users set role = 'READER' where user_id = $1", [stranger]);
    await assert.rejects(updateNovelEngagement({ userId: stranger, role: 'AUTHOR' }, novel, { following: true }), { httpStatus: 403 });
    await assert.rejects(updateNovelEngagement({ userId: reader, role: 'ADMIN' }, novel, { score: 8 }), { httpStatus: 403 });
    await assert.rejects(updateNovelEngagement({ userId: randomUUID(), role: 'READER' }, novel, { score: 8 }), { httpStatus: 403 });
    const initial = await readNovelStatistics(novel);
    assert.equal(initial.ratingAverage, null);
    assert.equal(initial.ratingsCount, 0);
    assert.equal(initial.followersCount, 0);
    assert.equal(initial.totalWords, 500);
    assert.equal((await readNovelStatistics(novel, authorAuth)).totalWords, 1400);
    await updateNovelEngagement(readerAuth, novel, { following: true });
    assert.equal((await updateNovelEngagement(readerAuth, novel, { following: true })).followersCount, 1);
    assert.equal((await readNovelStatistics(novel, readerAuth)).isFollowing, true);
    assert.equal((await readNovelStatistics(novel, otherAuth)).isFollowing, false);
    await updateNovelEngagement(readerAuth, novel, { score: 8, review: 'First review' });
    const revised = await updateNovelEngagement(readerAuth, novel, { score: 10 });
    assert.equal(revised.ratingAverage, 10);
    assert.equal(revised.ratingsCount, 1);
    assert.equal(revised.myRating, 10);
    assert.equal(revised.myReview, 'First review');
    await updateNovelEngagement(readerAuth, novel, { score: 10, review: 'Edited review' });
    const averaged = await updateNovelEngagement(otherAuth, novel, { score: 7, review: 'Another reader review' });
    assert.equal(averaged.ratingAverage, 8.5);
    assert.equal(averaged.ratingsCount, 2);
    assert.equal(averaged.myReview, 'Another reader review');
    const reviewsPage = await readNovelReviews(novel, 1, 1);
    assert.equal(reviewsPage.meta.totalItems, 2);
    assert.equal(reviewsPage.meta.ratingAverage, 8.5);
    // Sort before pagination; the average includes all text reviews.
    await pool.query("update novel_ratings set updated_at = '2026-01-01' where novel_id = $1 and user_id = $2", [novel, reader]);
    await pool.query("update novel_ratings set updated_at = '2026-01-02' where novel_id = $1 and user_id = $2", [novel, otherAuth.userId]);
    for (const [sort, expected] of [['newest', [7, 10]], ['oldest', [10, 7]], ['highest', [10, 7]], ['lowest', [7, 10]]] as const) {
      const first = await readNovelReviews(novel, 1, 1, undefined, sort);
      const second = await readNovelReviews(novel, 2, 1, undefined, sort);
      assert.deepEqual([first.data[0].score, second.data[0].score], expected);
      assert.equal(first.meta.ratingAverage, 8.5);
    }
    await updateNovelEngagement(otherAuth, novel, { score: 7, review: null });
    assert.equal((await readNovelReviews(novel, 1, 5)).meta.ratingAverage, 10);
    await updateNovelEngagement(otherAuth, novel, { score: 7, review: 'Another reader review' });
    assert.equal(reviewsPage.meta.totalPages, 2);
    assert.equal(reviewsPage.data.length, 1);
    assert.notEqual(reviewsPage.data[0].userId, (await readNovelReviews(novel, 2, 1)).data[0].userId);
    await pool.query("update users set status = 'LOCKED' where user_id = $1", [reader]);
    await assert.rejects(updateNovelEngagement(readerAuth, novel, { score: 9 }), { httpStatus: 403 });
    await assert.rejects(updateNovelEngagement(readerAuth, novel, { following: true }), { httpStatus: 403 });
    assert.equal((await readNovelStatistics(novel)).ratingAverage, 7);
    assert.equal((await readNovelStatistics(novel)).followersCount, 0);
    assert.equal((await readNovelReviews(novel, 1, 10)).meta.totalItems, 1);
    await pool.query("update users set status = 'ACTIVE', deleted_at = now() where user_id = $1", [reader]);
    await assert.rejects(updateNovelEngagement(readerAuth, novel, { score: 9 }), { httpStatus: 403 });
    await pool.query('update users set deleted_at = null where user_id = $1', [reader]);
    await assert.rejects(updateNovelEngagement(authorAuth, novel, { score: 10 }), { httpStatus: 403 });
    await assert.rejects(updateNovelEngagement(authorAuth, novel, { following: true }), { httpStatus: 403 });
    const privateId = projects.items.find(item => item.title === 'Private')!.novelId;
    await assert.rejects(readNovelStatistics(privateId), { httpStatus: 404 });
    await assert.rejects(readNovelStatistics(privateId, readerAuth), { httpStatus: 404 });
    assert.equal((await readNovelStatistics(privateId, authorAuth)).totalWords, 0);
    for (const score of [0, 11, 8.5, '8']) {
      assert.equal(novelRatingSchema.safeParse({ params: { novelId: novel }, body: { score } }).success, false);
    }
    await updateNovelEngagement(readerAuth, novel, { following: false });
    assert.equal((await updateNovelEngagement(readerAuth, novel, { following: false })).followersCount, 0);
    await updateNovelEngagement(readerAuth, novel, { score: null });
    const cleared = await updateNovelEngagement(otherAuth, novel, { score: null });
    assert.equal(cleared.ratingAverage, null);
    assert.equal(cleared.ratingsCount, 0);
    assert.equal((await readNovelReviews(novel, 1, 10)).meta.totalItems, 0);

    // Exercise the actual HTTP routes, authentication and body validation.
    const { createApp } = await import('../../app.js');
    const { default: jwt } = await import('jsonwebtoken');
    const { env } = await import('../../core/config/env.js');
    const server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}${env.API_PREFIX}/novels/${novel}`;
      const headers = { Authorization: `Bearer ${jwt.sign({ sub: reader, role: 'READER' }, env.JWT_ACCESS_SECRET)}`, 'Content-Type': 'application/json' };
      const unauthenticated = await fetch(`${base}/rating`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score: 9 }) });
      assert.equal(unauthenticated.status, 401);
      await unauthenticated.json();
      const invalid = await fetch(`${base}/rating`, { method: 'PUT', headers, body: JSON.stringify({ score: 11 }) });
      assert.equal(invalid.status, 400);
      await invalid.json();
      for (const review of ['   ', 'a'.repeat(2001), 42]) {
        const invalidReview = await fetch(`${base}/rating`, { method: 'PUT', headers, body: JSON.stringify({ score: 9, review }) });
        assert.equal(invalidReview.status, 400);
        await invalidReview.json();
      }
      for (const role of ['AUTHOR', 'ADMIN']) {
        const forbiddenHeaders = { ...headers, Authorization: `Bearer ${jwt.sign({ sub: reader, role }, env.JWT_ACCESS_SECRET)}` };
        for (const path of ['rating', 'follow']) {
          const forbidden = await fetch(`${base}/${path}`, { method: 'PUT', headers: forbiddenHeaders, body: JSON.stringify({ score: 9 }) });
          assert.equal(forbidden.status, 403);
          await forbidden.json();
        }
      }
      const rated = await fetch(`${base}/rating`, { method: 'PUT', headers, body: JSON.stringify({ score: 9, review: '  Review via HTTP  ' }) });
      assert.equal(rated.status, 200);
      assert.equal((await rated.json() as { data: { ratingAverage: number } }).data.ratingAverage, 9);
      const followed = await fetch(`${base}/follow`, { method: 'PUT', headers });
      assert.equal(followed.status, 200);
      assert.equal((await followed.json() as { data: { followersCount: number } }).data.followersCount, 1);
      const publicStats = await fetch(`${base}/statistics`);
      assert.equal(publicStats.status, 200);
      const data = (await publicStats.json() as { data: Awaited<ReturnType<typeof readNovelStatistics>> }).data;
      assert.equal(data.totalWords, 500);
      assert.equal(data.myRating, null);
      assert.equal(data.myReview, null);
      assert.equal(data.isFollowing, false);
      const invalidSort = await fetch(`${base}/reviews?sort=unknown`);
      assert.equal(invalidSort.status, 400);
      await invalidSort.json();
      const publicReviews = await fetch(`${base}/reviews?page=1&limit=5`);
      assert.equal(publicReviews.status, 200);
      const reviewData = await publicReviews.json() as { data: Array<{ score: number; review: string; userId: string }>; meta: { totalItems: number; ratingAverage: number | null } };
      assert.equal(reviewData.meta.totalItems, 1);
      assert.equal(reviewData.meta.ratingAverage, 9);
      assert.equal(reviewData.data[0].review, 'Review via HTTP');
      assert.equal(reviewData.data[0].score, 9);
      assert.equal(reviewData.data[0].userId, reader);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    await disconnect?.();
    if (created) await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  }
});
