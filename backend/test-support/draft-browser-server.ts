// Isolated, provider-free backend for the mounted draft-persistence browser test.
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

const schema = 'draft_browser_' + randomUUID().replaceAll('-', '');
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
let cleanupMongo: (() => Promise<void>) | undefined;
try {
await admin.query(`create schema "${schema}"`);
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set('options', `-c search_path=${schema},public`);
process.env.DATABASE_URL = url.href;
const mongoUrl = new URL(process.env.MONGODB_URI!);
mongoUrl.pathname = '/' + schema;
process.env.MONGODB_URI = mongoUrl.href;
process.send?.({ isolation: { postgresSchema: schema, mongoDatabase: schema } });
process.env.AI_SERVICE_URL = 'http://127.0.0.1:9';
const pg = await import('../src/core/database/postgres.js');
const mongo = await import('../src/core/database/mongo.js');
cleanupMongo = async () => { await mongo.getMongoDatabase().dropDatabase(); await mongo.disconnectMongo(); };
const pool = pg.getPostgresPool();
const migrations = new URL('../src/core/database/migrations/', import.meta.url);
for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
  await pool.query(await readFile(new URL(name, migrations), 'utf8'));
}
const drafts = await import('../src/modules/novels/draft-chapters.repository.js');
await drafts.ensureDraftChapterIndexes();
const accounts = [];
for (let index = 0; index < 2; index++) {
  const userId = randomUUID();
  await pool.query("insert into users(user_id,email,username,password_hash,role) values($1::uuid,$2,$1::text,'unused','AUTHOR')", [userId, userId + '@test.invalid']);
  const novelId = (await pool.query("insert into novels(author_id,title,slug,synopsis,status) values($1,'Browser draft',$2,'Test','PUBLISHED') returning novel_id", [userId, randomUUID()])).rows[0].novel_id;
  const chapterIds = [];
  for (let number = 1; number <= 2; number++) {
    const id = (await pool.query("insert into chapters(novel_id,title,chapter_number) values($1,'Draft',$2) returning chapter_id", [novelId, number])).rows[0].chapter_id;
    await drafts.upsertDraftChapter({ chapterId: id, novelId, authorId: userId, title: 'Draft', content: 'B', wordCount: 1, autosave: false });
    chapterIds.push(id);
  }
  accounts.push({ userId, novelId, chapterIds, token: jwt.sign({ sub: userId, role: 'AUTHOR' }, process.env.JWT_ACCESS_SECRET!) });
}
for (const [score, review] of [[10, 'Nhận xét có nội dung'], [4, null]] as const) {
  const reader = randomUUID();
  await pool.query("insert into users(user_id,email,username,password_hash,role) values($1::uuid,$2,$1::text,'unused','READER')", [reader, reader + '@test.invalid']);
  await pool.query("insert into user_profiles(user_id,display_name) values($1,'Độc giả thử nghiệm')", [reader]);
  await pool.query('insert into novel_ratings(novel_id,user_id,score,review_text) values($1,$2,$3,$4)', [accounts[0].novelId,reader,score,review]);
}
const { createApp } = await import('../src/app.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
process.send?.({ ready: true, accounts, base: 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port + '/api/v1' });
process.on('message', async (message: { id: number; action: string; chapterId?: string }) => {
  if (message.action === 'readback') {
    process.send?.({ id: message.id, draft: await drafts.findDraftChapterByChapterId(message.chapterId!),
      revisions: (await pool.query('select content,content_hash from chapter_revisions where chapter_id=$1 order by created_at', [message.chapterId])).rows,
      outbox: (await pool.query('select content_hash from revision_outbox_events where chapter_id=$1', [message.chapterId])).rows });
  } else if (message.action === 'close') {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongo.getMongoDatabase().dropDatabase();
    await mongo.disconnectMongo(); await pg.disconnectPostgres();
    const { disconnectChapterWriter } = await import('../src/modules/novels/chapter-writer.js');
    await disconnectChapterWriter();
    await admin.query(`drop schema "${schema}" cascade`); await admin.end();
    process.exit(0);
  }
});
} catch (error) {
  await cleanupMongo?.().catch(() => {});
  await admin.query(`drop schema if exists "${schema}" cascade`);
  await admin.end();
  console.error(error); process.exit(1);
}
