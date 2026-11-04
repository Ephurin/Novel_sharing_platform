import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import jwt from 'jsonwebtoken';

test('novel creation reuses seeded genre names and handles concurrent genre creation', {
  skip: process.env.RUN_NOVEL_GENRE_TESTS !== '1'
}, async () => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL for the isolated PostgreSQL test.');
  const schema = `novel_genre_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  let disconnect: (() => Promise<void>) | undefined;
  let created = false;
  try {
    await admin.query(`create schema "${schema}"`);
    created = true;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('options', `-csearch_path=${schema},public`);
    process.env.DATABASE_URL = url.href;
    const { getPostgresPool, disconnectPostgres } = await import('../../core/database/postgres.js');
    disconnect = disconnectPostgres;
    const pool = getPostgresPool();
    for (const migration of ['001_auth_user_wallet', '002_novels', '003_chapters', '014_novel_editorial_metadata']) {
      await pool.query(await readFile(new URL(`../../core/database/migrations/${migration}.sql`, import.meta.url), 'utf8'));
    }
    const { upsertGenre } = await import('./novels.repository.js');
    const { createNovel } = await import('./novels.service.js');
    const author = randomUUID();
    await pool.query("insert into users(user_id,email,username,role) values($1,'genre-test@example.invalid','genre-test','AUTHOR')", [author]);
    const seeded = (await pool.query("insert into genres(name,slug) values('Đời thường','admin-seed-genre-2') returning genre_id")).rows[0].genre_id;
    const auth = { userId: author, role: 'AUTHOR' as const };
    const input = { title: 'Thiên sứ nhà bên', synopsis: 'Giới thiệu truyện thử nghiệm.', genre: 'Đời thường', tags: [], coverImageUrl: 'http://localhost:8080/uploads/test-cover.jpg' };
    const novels = await Promise.all(Array.from({ length: 6 }, () => createNovel(auth, input)));
    assert.equal(new Set(novels.map(novel => novel.novelId)).size, 6);
    assert.ok(novels.every(novel => novel.genre === input.genre && novel.status === 'DRAFT' && novel.coverImageUrl === input.coverImageUrl));
    assert.equal(Number((await pool.query('select count(*) from novel_genres where genre_id=$1', [seeded])).rows[0].count), 6);
    assert.deepEqual((await pool.query('select name,slug from genres')).rows, [{ name: 'Đời thường', slug: 'admin-seed-genre-2' }]);

    const concurrent = await Promise.all(Array.from({ length: 6 }, () => createNovel(auth, { ...input, genre: 'Kỳ ảo mới' })));
    assert.equal(concurrent.length, 6);
    assert.equal(Number((await pool.query("select count(*) from genres where name='Kỳ ảo mới'")).rows[0].count), 1);
    const canonical = (await pool.query("insert into genres(name,slug) values('Fantasy','fantasy') returning genre_id")).rows[0].genre_id;
    assert.equal(await upsertGenre(pool, 'Fántasy'), canonical);
    assert.equal((await pool.query('select name from genres where genre_id=$1', [canonical])).rows[0].name, 'Fantasy');
    assert.equal(await upsertGenre(pool, '  Đời thường  '), seeded);
    assert.equal(await upsertGenre(pool, '  '), null);

    // Exercise the same authenticated POST used by the new-project dialog.
    await pool.query('alter table users add column if not exists deleted_at timestamptz');
    await pool.query('create table admin_access(user_id uuid primary key, scope text)');
    const { createApp } = await import('../../app.js');
    const server = createApp().listen(0, '127.0.0.1');
    try {
      await new Promise<void>(resolve => server.once('listening', resolve));
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const token = jwt.sign({ sub: author, role: 'AUTHOR' }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '5m' });
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/novels`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
      const body = await response.json() as { data: { genre: string; status: string; novelId: string } };
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(body.data.genre, 'Đời thường');
      assert.equal(body.data.status, 'DRAFT');
      assert.ok(body.data.novelId);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  } finally {
    await disconnect?.();
    try { if (created) await admin.query(`drop schema "${schema}" cascade`); }
    finally { await admin.end(); }
  }
});
