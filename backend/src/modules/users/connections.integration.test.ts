import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { env } from '../../core/config/env.js';
import { createApp } from '../../app.js';
import { notifyFollowersOfPublishedChapter } from '../interactions/new-chapter-notifications.js';

test('account follow HTTP contract, mutual, privacy, pagination and legacy compatibility', async () => {
  const pool = getPostgresPool();
  await validateTestDatabaseIsolation(pool, getMongoDatabase());
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const [a,b,author,locked,deleted] = ids;
  const prefix = 'social_' + randomUUID().replaceAll('-', '');
  const server = createApp().listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api/v1`;
  async function request(path: string, method='GET', user?: string) {
    const response = await fetch(base + path, { method, headers: user ? { Authorization: 'Bearer ' + jwt.sign({ sub: user, role: 'READER' }, env.JWT_ACCESS_SECRET) } : {} });
    return { status: response.status, body: await response.json() as any };
  }
  try {
    for (const [i,id] of ids.entries()) {
      await pool.query("insert into users(user_id,email,username,password_hash,role,status,deleted_at) values($1,$2,$3,'hash',$4,$5,$6)", [id, id+'@test.invalid',prefix+i,id===author?'AUTHOR':'READER',id===locked?'LOCKED':'ACTIVE',id===deleted?new Date():null]);
      await pool.query('insert into user_profiles(user_id,display_name) values($1,$2)', [id, prefix+' display '+i]);
    }
    assert.equal((await request(`/users/${b}/follow`,'POST')).status,401);
    assert.equal((await request(`/users/${a}/follow`,'POST',a)).status,409);
    assert.equal((await request(`/authors/${b}/follow`,'POST',a)).status,404);
    assert.equal((await request(`/authors/${b}/follow`,'DELETE',a)).status,404);
    for (const target of [locked,deleted,randomUUID()]) assert.equal((await request(`/users/${target}/follow`,'POST',a)).status,404);
    for (const actor of [locked,deleted]) assert.equal((await request(`/users/${b}/follow`,'POST',actor)).status,403);
    assert.equal((await request('/users/not-a-uuid/follow','POST',a)).status,400);
    const concurrent = await Promise.all([request(`/users/${b}/follow`,'POST',a),request(`/users/${b}/follow`,'POST',a)]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    assert.equal((await request(`/users/${a}/profile`,'GET',b)).body.data.followedBy,true);
    assert.equal((await request(`/users/${a}/follow`,'POST',b)).body.data.mutual,true);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where user_id=any($1::uuid[]) and type='AUTHOR_FOLLOW'",[[a,b]])).rows[0].n,0);
    const profile = (await request(`/users/${b}/profile`,'GET',a)).body.data;
    assert.equal(profile.mutual,true); assert.equal(profile.followersCount,1); assert.equal(profile.mutualCount,1);
    assert.equal('email' in profile,false); assert.equal('notificationEnabled' in profile,false);
    assert.equal((await request(`/users/${b}/profile`)).body.data.following,false);
    for (const type of ['FOLLOWING','FOLLOWERS','MUTUAL']) {
      const result = await request(`/users/me/connections?type=${type}&limit=1`,'GET',a);
      assert.equal(result.status,200); assert.equal(result.body.meta.totalItems,1); assert.equal(result.body.data[0].userId,b);
    }
    const empty = await request('/users/me/connections?type=MUTUAL&page=2&limit=1','GET',a);
    assert.equal(empty.body.meta.totalItems,1); assert.deepEqual(empty.body.data,[]);
    assert.equal((await request('/users/me/connections?type=INVALID','GET',a)).status,400);
    assert.equal((await request('/users/me/connections?type=MUTUAL')).status,401);
    assert.equal((await request('/users/search?limit=101')).status,400);
    const search = await request(`/users/search?q=${prefix}&limit=2`,'GET',a);
    assert.equal(search.body.meta.totalItems,3); assert.equal(search.body.data.length,2);
    assert.equal((await request(`/users/search?q=${encodeURIComponent(prefix+' display 1')}`)).body.data[0].userId,b);
    assert.equal((await request('/users/search?q=%25')).body.meta.totalItems,0);
    assert.equal((await request(`/users/${locked}/profile`)).status,404);
    assert.equal((await request(`/users/${deleted}/profile`)).status,404);
    await pool.query("update users set role='AUTHOR' where user_id=$1",[b]);
    assert.equal((await request(`/users/${b}/profile`,'GET',a)).body.data.mutual,true);
    assert.equal((await request(`/authors/${b}/follow`,'POST',a)).status,409);
    assert.equal((await request(`/authors/${b}/followers/count`)).body.data.followersCount,1);
    assert.equal((await request(`/authors/${b}/follow`,'DELETE',a)).status,200);
    assert.equal((await request(`/users/${b}/follow`,'DELETE',a)).status,404);
    assert.equal((await request(`/users/${b}/profile`,'GET',a)).body.data.mutual,false);
    assert.equal((await request(`/authors/${author}/follow`,'POST',a)).status,200);
    assert.equal((await request(`/users/${author}/follow`,'POST',a)).status,409);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where user_id=$1 and type='AUTHOR_FOLLOW'",[author])).rows[0].n,1);
    assert.equal((await request(`/users/${author}/follow`,'DELETE',a)).status,200);
    assert.equal((await request(`/users/${author}/follow`,'POST',a)).status,200);
    const novel = (await pool.query("insert into novels(author_id,title,slug,synopsis,status) values($1,'Social',$2,'Test','PUBLISHED') returning novel_id",[author,prefix])).rows[0].novel_id;
    const chapter = (await pool.query("insert into chapters(novel_id,chapter_number,title,content,status) values($1,1,'First','Text','PUBLISHED') returning chapter_id",[novel])).rows[0].chapter_id;
    assert.equal(await notifyFollowersOfPublishedChapter(pool,chapter),1);
    assert.equal(await notifyFollowersOfPublishedChapter(pool,chapter),1);
    assert.equal((await pool.query("select count(*)::int as n from notification_events where user_id=$1 and payload->>'chapterId'=$2",[a,chapter])).rows[0].n,1);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
    // The isolated runner owns and drops the entire disposable DB, including notification outbox rows.
    await disconnectMongo(); await disconnectPostgres();
  }
});
