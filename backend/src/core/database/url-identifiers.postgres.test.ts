
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runPostgresMigrations } from './migrate.js';
import { backfillUrlIdentifiers } from './url-identifiers.js';
import { isAllowedTestDbName } from './test-db-guard.js';

const migrations = fileURLToPath(new URL('./migrations/', import.meta.url));

for (const interrupted of [false, true]) {
  test(interrupted ? 'URL upgrade resumes with the identifiers already committed' : 'latest migration directly upgrades existing URL-less data', {
    skip: process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS !== '1',
    timeout: 60_000
  }, async () => {
    const isolatedUrl = new URL(process.env.DATABASE_URL ?? '');
    assert.ok(isAllowedTestDbName(isolatedUrl.pathname.slice(1)), 'Migration tests require an isolated control database');
    const database = 'ephurin_test_url_' + randomUUID().replaceAll('-', '');
    const control = new pg.Client({ connectionString: isolatedUrl.href });
    await control.connect();
    const previous = await mkdtemp(path.join(tmpdir(), 'storycraft-url-migrations-'));
    const legacyFiles = (await readdir(migrations)).filter(name => name < '053_');
    await Promise.all(legacyFiles.map(name => copyFile(path.join(migrations, name), path.join(previous, name))));
    await control.query(`create database "${database}"`);
    isolatedUrl.pathname = '/' + database;
    const pool = new pg.Pool({ connectionString: isolatedUrl.href });
    const client = await pool.connect();

    try {
      await runPostgresMigrations(client, previous);
      const authorId = randomUUID();
      await client.query(`insert into users(user_id,email,username,created_at)
        values($1,'one@example.invalid','Author_Name','2024-01-01'),
        ($2,'two@example.invalid','author_name','2024-01-02')`, [authorId, randomUUID()]);
      const novelId = randomUUID();
      await client.query("insert into novels(novel_id,author_id,title,synopsis,slug) values($1,$2,'Đi xa','Mẫu','di--xa')", [novelId, authorId]);
      const firstId = '00000000-0000-4000-8000-000000000001';
      const secondId = '00000000-0000-4000-8000-000000000002';
      await client.query("insert into chapters(chapter_id,novel_id,title,chapter_number) values($1,$3,'Chương 1: Đi xa',1),($2,$3,'Đi vào rừng',2)", [firstId, secondId, novelId]);
      await client.query(`insert into discussion_topics(author_id,category_id,title,body)
        select $1,category_id,'Đọc đi','Nội dung đủ dài để kiểm tra việc cấp slug.' from discussion_categories limit 1`, [authorId]);

      let committed: string | undefined;
      if (interrupted) {
        const expansion = '053_url_identifiers.sql';
        await copyFile(path.join(migrations, expansion), path.join(previous, expansion));
        await runPostgresMigrations(client, previous);
        await client.query(`
          create function fail_second_url_row() returns trigger language plpgsql as $$
          begin
            if new.chapter_number = 2 then raise exception 'interrupted batch'; end if;
            return new;
          end
          $$;
          create trigger fail_second_url_row before update of slug on chapters
            for each row execute function fail_second_url_row();
        `);
        await assert.rejects(backfillUrlIdentifiers(client, 1), /interrupted batch/);
        const progress = await client.query<{ slug: string | null }>('select slug from chapters order by chapter_number');
        assert.match(progress.rows[0]?.slug ?? '', /^chuong-1-di-xa-[0-9a-f]{8}$/);
        assert.equal(progress.rows[1]?.slug, null);
        committed = progress.rows[0]?.slug ?? undefined;
        await client.query('drop trigger fail_second_url_row on chapters; drop function fail_second_url_row()');
        const concurrent = await pool.query<{ public_key: string }>(
          "insert into users(email,username) values('three@example.invalid','AUTHOR_NAME') returning public_key"
        );
        assert.match(concurrent.rows[0]?.public_key ?? '', /^author-name-[0-9a-f]{8}$/);
      }

      await runPostgresMigrations(client);
      const chapters = await client.query<{ chapter_id: string; slug: string }>('select chapter_id, slug from chapters order by chapter_number');
      assert.match(chapters.rows[0]?.slug ?? '', /^chuong-1-di-xa-[0-9a-f]{8}$/);
      if (committed) assert.equal(chapters.rows[0]?.slug, committed);
      const author = await client.query<{ public_key: string }>('select public_key from users where user_id = $1', [authorId]);
      assert.equal(author.rows[0]?.public_key, 'author-name');
      const novel = await client.query<{ slug: string }>('select slug from novels where novel_id = $1', [novelId]);
      assert.equal(novel.rows[0]?.slug, 'di-xa');
      const topic = await client.query<{ slug: string }>('select slug from discussion_topics');
      assert.match(topic.rows[0]?.slug ?? '', /^doc-di-[0-9a-f]{8}$/);
      await client.query("update chapters set title = 'Đổi tên', chapter_number = 8 where chapter_id = $1", [firstId]);
      await backfillUrlIdentifiers(client, 1);
      assert.deepEqual((await client.query('select chapter_id, slug from chapters order by chapter_id')).rows, chapters.rows);
      await assert.rejects(client.query('update chapters set slug = null where chapter_id = $1', [firstId]), { code: '23502' });
      await client.query('update chapters set deleted_at=now() where chapter_id=$1', [firstId]);
      await assert.rejects(client.query(
        'insert into chapters(novel_id,title,chapter_number,slug) values($1,$2,9,$3)',
        [novelId, 'Trùng slug đã xóa mềm', chapters.rows[0]?.slug]
      ), { code: '23505' });
    } finally {
      client.release();
      await pool.end();
      await control.query(`drop database "${database}"`);
      await control.end();
      await rm(previous, { recursive: true, force: true });
    }
  });
}

test('repeated seeds keep published URL mappings and refuse a foreign slug or chapter position', {
  skip: process.env.EPHURIN_ALLOW_TEST_DB_MUTATIONS !== '1',
  timeout: 90_000
}, async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  assert.ok(isAllowedTestDbName(databaseUrl.pathname.slice(1)));
  const pool = new pg.Pool({ connectionString: databaseUrl.href });
  const runSeed = (script: string) => spawnSync(process.execPath, [
    fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
    fileURLToPath(new URL('../../scripts/' + script, import.meta.url))
  ], { encoding: 'utf8', env: process.env, timeout: 30_000 });
  const runSuccessfully = (script: string) => {
    const result = runSeed(script);
    assert.equal(result.status, 0, result.stderr);
  };
  const stableMappings = () => pool.query(`
    select 'novel' as kind, novel_id as id, slug from novels
    union all select 'chapter', chapter_id, slug from chapters
    union all select 'user', user_id, public_key from users
    order by kind, id
  `);
  try {
    runSuccessfully('seed-sample-stories.ts');
    runSuccessfully('seed-author-workspace.ts');
    const novelId = '451e1280-214c-4500-980b-34b9af0989eb';
    const extraChapter = randomUUID();
    await pool.query("insert into chapters(chapter_id,novel_id,title,chapter_number) values($1,$2,'Independent draft',500)", [extraChapter, novelId]);
    const before = await stableMappings();
    runSuccessfully('seed-sample-stories.ts');
    runSuccessfully('seed-author-workspace.ts');
    assert.deepEqual((await stableMappings()).rows, before.rows);

    const independentNovel = randomUUID();
    await pool.query(`
      update novels set slug='sample-retained-mapping' where novel_id=$1;
    `, [novelId]);
    await pool.query(`
      insert into novels(novel_id,author_id,title,synopsis,slug)
      select $2,author_id,'Independent novel','Independent novel','sample-thanh-van-test-story'
      from novels where novel_id=$1
    `, [novelId, independentNovel]);
    const collision = runSeed('seed-sample-stories.ts');
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /belongs to a different novel/);
    assert.equal((await pool.query('select 1 from novels where novel_id=$1', [independentNovel])).rowCount, 1);
    assert.equal((await pool.query('select 1 from chapters where chapter_id=$1', [extraChapter])).rowCount, 1);

    await pool.query("update novels set slug='independent-retained-slug' where novel_id=$1", [independentNovel]);
    await pool.query('update chapters set chapter_number=499 where novel_id=$1 and chapter_number=1', [novelId]);
    await pool.query('update chapters set chapter_number=1 where chapter_id=$1', [extraChapter]);
    const positionCollision = runSeed('seed-sample-stories.ts');
    assert.notEqual(positionCollision.status, 0);
    assert.match(positionCollision.stderr, /23505|chapters_novel_id_chapter_number_key/);
    assert.equal((await pool.query('select 1 from chapters where chapter_id=$1 and chapter_number=1', [extraChapter])).rowCount, 1);
  } finally {
    await pool.end();
  }
});
