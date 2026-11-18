// Isolated, provider-free backend for the mounted draft-persistence browser test.
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
process.env.PRIVATE_COMMENTS_ENABLED = 'true';
const { env } = await import('../src/core/config/env.js'); env.PRIVATE_COMMENTS_ENABLED = true;
const accounts = [];
const passwordHash = await bcrypt.hash('SocialTest123!', 4);
for (const [index, role] of ['AUTHOR', 'READER', 'READER', 'READER'].entries()) {
  const userId = randomUUID();
  await pool.query("insert into users(user_id,email,username,password_hash,role) values($1,$2,$3,$4,$5)", [userId, userId+'@test.invalid', 'social'+index, passwordHash, role]);
  await pool.query('insert into user_profiles(user_id,display_name) values($1,$2)', [userId, 'Social '+index]);
  accounts.push({ userId, role, token: jwt.sign({ sub: userId, role }, process.env.JWT_ACCESS_SECRET!) });
}
const novelId = (await pool.query("insert into novels(author_id,title,slug,synopsis,status) values($1,'Social browser',$2,'Test','PUBLISHED') returning novel_id", [accounts[0].userId, randomUUID()])).rows[0].novel_id;
const chapterId = (await pool.query("insert into chapters(novel_id,chapter_number,title,content,status) values($1,1,'Social chapter','Opening paragraph.\n\nMiddle paragraph.\n\nClosing paragraph.','PUBLISHED') returning chapter_id", [novelId])).rows[0].chapter_id;
const { createApp } = await import('../src/app.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
process.send?.({ ready: true, accounts, novelId, chapterId, base: 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port + '/api/v1' });
process.on('message', async (message: { id: number; action: string; chapterId?: string }) => {
  if (message.action === 'approve') {
    await mongo.getMongoDatabase().collection('comments').updateMany({}, {$set:{status:'APPROVED'}});
    process.send?.({id:message.id,ok:true});
  } else if (message.action === 'notify') {
    const { deliverDomainNotifications } = await import('../src/modules/interactions/domain-notifications.js');
    await deliverDomainNotifications();
    process.send?.({id:message.id,ok:true});
  } else if (message.action === 'vip') {
    await pool.query('update chapters set is_vip=true,price_coins=10 where chapter_id=$1', [chapterId]);
    process.send?.({id:message.id,ok:true});
  } else if (message.action === 'detach') {
    await pool.query("update chapters set content='Revised paragraph.' where chapter_id=$1", [chapterId]);
    process.send?.({id:message.id,ok:true});
  } else if (message.action === 'prepend') {
    await pool.query('update chapters set content=$2::text || content where chapter_id=$1', [chapterId, 'New paragraph.\n\n']);
    process.send?.({id:message.id,ok:true});
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
