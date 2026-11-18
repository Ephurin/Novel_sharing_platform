import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const migrations = (names: string[], pool: pg.Pool) => names.reduce(async (prior, name) => {
  await prior;
  await pool.query(await readFile(new URL(`../../core/database/migrations/${name}.sql`, import.meta.url), 'utf8'));
}, Promise.resolve());

// UI walkthrough (UI-1): after the last chapter is deleted, the next new chapter takes its number
// instead of skipping it. A deleted chapter in the middle keeps its number.
test('a new chapter reuses the number of a deleted last chapter', {
  skip: process.env.RUN_UI_WALKTHROUGH_PG_TESTS !== '1'
}, async () => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL for the isolated PostgreSQL test.');
  const schema = `chapter_number_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 3000 });
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  const pool = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 3000 });
  await admin.query(`create schema "${schema}"`);
  try {
    for (const migration of ['001_auth_user_wallet', '002_novels', '003_chapters']) {
      await pool.query(await readFile(new URL(`../../core/database/migrations/${migration}.sql`, import.meta.url), 'utf8'));
    }
    await pool.query('alter table chapters add column if not exists import_key varchar(128), add column if not exists import_hash varchar(64)');
    const { getNextChapterNumber, createChapter } = await import('./chapters.repository.js');
    const author = randomUUID();
    await pool.query("insert into users(user_id,email,username,role) values($1,'num-test@example.invalid','num-test','AUTHOR')", [author]);
    const novelId = (await pool.query("insert into novels(author_id,title,slug,synopsis) values($1,'Thử','thu-num-test','Giới thiệu') returning novel_id", [author])).rows[0].novel_id;
    const add = async (title: string) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const chapterNumber = await getNextChapterNumber(client, novelId);
        const row = await createChapter(client, { novelId, title, chapterNumber, wordCount: 0, isVip: false, priceCoins: 0 });
        await client.query('commit');
        return row;
      } finally { client.release(); }
    };
    const remove = (chapterId: string) => pool.query('update chapters set deleted_at = now() where chapter_id = $1', [chapterId]);
    const active = async () => (await pool.query('select title, chapter_number from chapters where novel_id = $1 and deleted_at is null order by chapter_number', [novelId])).rows
      .map(row => `${row.chapter_number}:${row.title}`);

    const [one, two, three] = [await add('Một'), await add('Hai'), await add('Ba')];
    assert.deepEqual([one.chapterNumber, two.chapterNumber, three.chapterNumber], [1, 2, 3]);

    await remove(three.chapterId);
    assert.equal((await add('Ba mới')).chapterNumber, 3, 'the deleted last chapter frees its number');

    const four = await add('Bốn');
    await remove(four.chapterId);
    assert.equal((await add('Bốn mới')).chapterNumber, 4, 'a second delete of the last chapter also frees it');

    await remove(two.chapterId);
    assert.equal((await add('Năm')).chapterNumber, 5, 'a deleted middle chapter keeps its number');
    assert.deepEqual(await active(), ['1:Một', '3:Ba mới', '4:Bốn mới', '5:Năm']);

    const deleted = (await pool.query('select chapter_number from chapters where novel_id = $1 and deleted_at is not null order by chapter_number', [novelId])).rows
      .map(row => row.chapter_number);
    assert.deepEqual(deleted, [-2, -1, 2], 'freed tombstones move to distinct negative numbers');
  } finally {
    await pool.end();
    await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  }
});

// UI walkthrough (UI-2): the IDE kept showing "ch. 9: the AI service did not answer" after the author
// re-analysed ch. 9 successfully, because the failed background row for that revision stayed FAILED.
test('an author re-analysis closes the failed background analysis of the same revision', {
  skip: process.env.RUN_UI_WALKTHROUGH_PG_TESTS !== '1'
}, async () => {
  const schema = `analysis_status_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL!);
  const admin = new pg.Pool({ connectionString: url.href, connectionTimeoutMillis: 3000 });
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  process.env.DATABASE_URL = url.href;
  await admin.query(`create schema "${schema}"`);
  const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
  try {
    const pool = getPostgresPool();
    await migrations(['001_auth_user_wallet', '002_novels', '003_chapters', '009_chapter_revisions', '010_analysis_outbox', '011_outbox_claim_token'], pool);
    const { listLatestChapterAnalysis, supersedeBackgroundAnalysis } = await import('./outbox.repository.js');
    const author = randomUUID();
    await pool.query("insert into users(user_id,email,username,role) values($1,$2,$3,'AUTHOR')", [author, `${author}@example.invalid`, `st-${author.slice(0, 8)}`]);
    const novelId = (await pool.query("insert into novels(author_id,title,slug,synopsis) values($1,'Thử',$2,'Giới thiệu') returning novel_id", [author, `thu-${author}`])).rows[0].novel_id;
    const chapter = async (n: number, status: string, deleted = false) => {
      const chapterId = (await pool.query('insert into chapters(novel_id,title,chapter_number,deleted_at) values($1,$2,$3,$4) returning chapter_id',
        [novelId, `Chương ${n}`, n, deleted ? new Date() : null])).rows[0].chapter_id;
      const revisionId = (await pool.query("insert into chapter_revisions(novel_id,chapter_id,content_hash,content) values($1,$2,'h','x') returning revision_id", [novelId, chapterId])).rows[0].revision_id;
      await pool.query('update chapters set latest_revision_id=$2 where chapter_id=$1', [chapterId, revisionId]);
      await pool.query("insert into revision_outbox_events(event_type,novel_id,chapter_id,revision_id,content_hash,status,last_error) values('INCREMENTAL_ANALYSIS',$1,$2,$3,'h',$4,$5)",
        [novelId, chapterId, revisionId, status, status === 'FAILED' ? 'HTTP 504 PROVIDER_TIMEOUT' : null]);
      return revisionId;
    };
    const failed = await chapter(9, 'FAILED');
    const processing = await chapter(10, 'PROCESSING');
    await chapter(11, 'FAILED', true);
    const before = await listLatestChapterAnalysis(novelId);
    assert.deepEqual(before.map(row => [row.chapter_number, row.status, row.waiting_reason]),
      [[9, 'FAILED', 'provider_unavailable'], [10, 'PROCESSING', null]], 'a deleted chapter is not listed');

    assert.equal(await supersedeBackgroundAnalysis(failed), 1);
    assert.equal(await supersedeBackgroundAnalysis(processing), 0, 'a row being processed is left alone');
    const after = await listLatestChapterAnalysis(novelId);
    assert.deepEqual(after.map(row => [row.chapter_number, row.status, row.waiting_reason]),
      [[9, 'COMPLETED', null], [10, 'PROCESSING', null]]);
  } finally {
    await disconnectPostgres();
    await admin.query(`drop schema "${schema}" cascade`);
    await admin.end();
  }
});
