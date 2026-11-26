import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import { getMongoDatabase, disconnectMongo } from '../../core/database/mongo.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { env } from '../../core/config/env.js';
import { moderatorPermissionsFor } from '../../core/security/moderation-policy.js';
import { waitForBlockedTransaction } from '../../core/database/test-postgres-locks.js';
import { lockAdminAccess } from './admin-access.js';
import { applyUserAccessChange } from './admin-access-change.js';
import {
  convertLegacyModeratorAccounts,
  inventoryLegacyModeratorConversion,
  listLegacyModeratorAccounts,
  rollbackModeratorConversion
} from './moderator-conversion.js';

async function insertUser(
  pool: ReturnType<typeof getPostgresPool>,
  user: { id: string; role: string; status?: string }
) {
  await pool.query(
    "insert into users(user_id,email,username,password_hash,role,status) values($1,$2,$3,$4,$5,$6)",
    [
      user.id,
      `pr07-${user.id}@example.test`,
      `pr07-${user.id.slice(0, 12)}`,
      'test-only',
      user.role,
      user.status ?? 'ACTIVE'
    ]
  );
}

describe('PR-07: legacy moderator access conversion', { concurrency: false }, () => {
  const pool = getPostgresPool();
  const actor = randomUUID();
  const legacy = randomUUID();
  const lockedLegacy = randomUUID();
  const missingScopeAdmin = randomUUID();
  const author = randomUUID();
  const reader = randomUUID();
  const legacyNovel = randomUUID();
  const authorNovel = randomUUID();
  const legacyChapter = randomUUID();

  const userRow = async (id: string) =>
    (
      await pool.query(
        'select u.role,u.status,u.access_version,a.scope from users u left join admin_access a using(user_id) where u.user_id=$1',
        [id]
      )
    ).rows[0];

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    await insertUser(pool, { id: actor, role: 'ADMIN' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'SUPER_ADMIN')", [actor]);
    await insertUser(pool, { id: legacy, role: 'ADMIN' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')", [legacy]);
    await insertUser(pool, { id: lockedLegacy, role: 'ADMIN', status: 'LOCKED' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')", [lockedLegacy]);
    await insertUser(pool, { id: missingScopeAdmin, role: 'ADMIN' });
    await insertUser(pool, { id: author, role: 'AUTHOR' });
    await insertUser(pool, { id: reader, role: 'READER' });

    // Personal footprint the conversion must preserve verbatim.
    await pool.query(
      "insert into novels(novel_id,author_id,title,slug,synopsis,status,published_at) values($1,$2,'PR-07 truyện legacy','pr07-legacy','Tác phẩm của tài khoản legacy chuyển đổi.','PUBLISHED',now())",
      [legacyNovel, legacy]
    );
    await pool.query(
      "insert into chapters(chapter_id,novel_id,chapter_number,title,content,status,published_at) values($1,$2,1,'PR-07 chương legacy','Nội dung chương legacy.','PUBLISHED',now())",
      [legacyChapter, legacyNovel]
    );
    await pool.query(
      "insert into chapter_publication_schedules(chapter_id,scheduled_at,draft_version,status) values($1,now() - interval '1 second',1,'PUBLISHED')",
      [legacyChapter]
    );
    await pool.query('insert into wallets(user_id,coins_balance) values($1,777)', [legacy]);
    await pool.query("insert into refresh_tokens(user_id,token_hash,expires_at) values($1,$2,now() + interval '30 days')", [
      legacy,
      `pr07-${legacy}`
    ]);
    await pool.query("insert into novel_follows(novel_id,user_id) values($1,$2)", [legacyNovel, reader]);
    await pool.query(
      "insert into reading_histories(user_id,novel_id,chapter_id) values($1,$2,$3)",
      [legacy, legacyNovel, legacyChapter]
    );
    await pool.query(
      "insert into novels(novel_id,author_id,title,slug,synopsis,status,published_at) values($1,$2,'PR-07 truyện tác giả','pr07-author','Tác phẩm của tác giả thường, không nằm trong phạm vi chuyển đổi.','PUBLISHED',now())",
      [authorNovel, author]
    );
  });

  after(async () => {
    await disconnectPostgres();
    await disconnectMongo();
  });

  test('PR-07: dry-run inventories only matching legacy pairs', async () => {
    const fixtureIds: string[] = [legacy, lockedLegacy, missingScopeAdmin, author, reader];
    // The isolated runner shares one database across test files, so scope the
    // inventory assertions to this suite's own fixtures.
    const accounts = (await inventoryLegacyModeratorConversion(pool)).filter((account) =>
      fixtureIds.includes(account.userId)
    );
    assert.equal(accounts.length, 2);
    const target = accounts.find((account) => account.userId === legacy)!;
    assert.ok(target, 'legacy account missing from inventory');
    assert.equal(target.scope, 'MODERATOR');
    assert.equal(target.personal.novels, 1);
    assert.equal(target.personal.chaptersPublished, 1);
    assert.equal(target.personal.scheduledChapters, 1);
    assert.equal(target.personal.walletCoins, '777');
    assert.equal(target.personal.follows, 1);
    assert.equal(target.personal.readingHistories, 1);
    assert.equal(target.personal.activeRefreshSessions, 1);
    const locked = accounts.find((account) => account.userId === lockedLegacy)!;
    assert.equal(locked.status, 'LOCKED');
    const listed = (await listLegacyModeratorAccounts(pool)).map((row) => row.user_id);
    assert.ok(!listed.includes(missingScopeAdmin), 'admin without scope must not be a legacy pair');
    assert.ok(!listed.includes(author), 'author must not be a legacy pair');
  });

  test('PR-07: conversion stays blocked while the rollout flag is off', async () => {
    env.MODERATOR_ENABLED = false;
    await assert.rejects(convertLegacyModeratorAccounts({ userId: actor }, 'PR-07 conversion'), {
      code: 'MODERATOR_DISABLED'
    } as never);
    assert.equal((await userRow(legacy)).role, 'ADMIN');
  });

  test('PR-07: two racing conversions converge with one winner and preserved data', async () => {
    env.MODERATOR_ENABLED = true;
    const beforeFingerprint = (
      await pool.query(
        `select md5(string_agg(row_to_json(t)::text,',' order by novel_id)) as fingerprint from (select * from novels where author_id=$1) t`,
        [legacy]
      )
    ).rows[0].fingerprint;

    const [first, second] = await Promise.allSettled([
      convertLegacyModeratorAccounts({ userId: actor }, 'PR-07 chuyển đổi legacy', { accounts: [legacy] }),
      convertLegacyModeratorAccounts({ userId: actor }, 'PR-07 chuyển đổi legacy (đua)', { accounts: [legacy] })
    ]);
    assert.equal(first.status, 'fulfilled');
    assert.equal(second.status, 'fulfilled');
    const outcomes = [first, second].map((entry) => entry.value!);
    assert.equal(outcomes.reduce((total, outcome) => total + outcome.converted.length, 0), 1);
    assert.equal(outcomes.reduce((total, outcome) => total + outcome.skipped.length, 0), 1);

    const row = await userRow(legacy);
    assert.equal(row.role, 'MODERATOR');
    assert.equal(row.scope, null);
    assert.equal(row.access_version, 1);
    assert.equal(row.status, 'ACTIVE');

    const afterFingerprint = (
      await pool.query(
        `select md5(string_agg(row_to_json(t)::text,',' order by novel_id)) as fingerprint from (select * from novels where author_id=$1) t`,
        [legacy]
      )
    ).rows[0].fingerprint;
    assert.equal(afterFingerprint, beforeFingerprint);
    const sessionRow = (
      await pool.query('select count(*)::int as count from refresh_tokens where user_id=$1 and revoked_at is not null', [
        legacy
      ])
    ).rows[0];
    assert.equal(sessionRow.count, 1);
    const audits = (
      await pool.query(
        "select * from admin_audit where affected_user_id=$1 and action='USER_ACCESS_CHANGED'",
        [legacy]
      )
    ).rows;
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor_id, actor);
    assert.equal(audits[0].before_state.role, 'ADMIN');
    assert.equal(audits[0].before_state.scope, 'MODERATOR');
    assert.equal(audits[0].after_state.role, 'MODERATOR');
    assert.ok(moderatorPermissionsFor('MODERATOR').includes('publication.review'));
    assert.deepEqual(moderatorPermissionsFor('READER'), []);
  });

  test('PR-07: rerunning the conversion skips converted accounts', async () => {
    const rerun = await convertLegacyModeratorAccounts({ userId: actor }, 'PR-07 chạy lại sau gián đoạn', {
      accounts: [legacy]
    });
    assert.equal(rerun.converted.length, 0);
    assert.equal(rerun.skipped.length, 1);
    assert.equal(rerun.skipped[0].userId, legacy);
    assert.equal((await userRow(legacy)).access_version, 1);
    const audits = (
      await pool.query("select count(*)::int as count from admin_audit where affected_user_id=$1", [legacy])
    ).rows[0];
    assert.equal(audits.count, 1);
  });

  test('PR-07: a locked legacy account converts while keeping its lock status', async () => {
    const result = await convertLegacyModeratorAccounts(
      { userId: actor },
      'PR-07 chuyển đổi tài khoản bị khóa',
      { accounts: [lockedLegacy] }
    );
    assert.equal(result.converted.length, 1);
    const row = await userRow(lockedLegacy);
    assert.equal(row.role, 'MODERATOR');
    assert.equal(row.status, 'LOCKED');
    assert.equal(row.scope, null);
  });

  test('PR-07: an explicitly requested non-legacy account goes to reconciliation', async () => {
    const result = await convertLegacyModeratorAccounts({ userId: actor }, 'PR-07 đối soát', {
      accounts: [reader, legacy]
    });
    assert.equal(result.reconciliation.length, 1);
    assert.equal(result.reconciliation[0].userId, reader);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.converted.length, 0);
  });

  test('PR-07: rollback restores role, scope and session expectations', async () => {
    const rollback = await rollbackModeratorConversion(
      { userId: actor },
      [{ userId: legacy.toUpperCase(), scope: 'MODERATOR' }],
      'PR-07 rollback diễn tập'
    );
    assert.equal(rollback.converted.length, 1);
    assert.equal(rollback.reconciliation.length, 0);
    const row = await userRow(legacy);
    assert.equal(row.role, 'ADMIN');
    assert.equal(row.scope, 'MODERATOR');
    assert.equal(row.access_version, 2);
    const audits = (
      await pool.query(
        "select count(*)::int as count from admin_audit where affected_user_id=$1 and action='USER_ACCESS_CHANGED'",
        [legacy]
      )
    ).rows[0];
    assert.equal(audits.count, 2);
  });

  test('PR-07: retry of a verified rollback is a no-op', async () => {
    const result = await rollbackModeratorConversion({ userId: actor }, [{ userId: legacy, scope: 'MODERATOR' }], 'Lặp lại.');
    assert.equal(result.skipped.length, 1);
    assert.equal(result.reconciliation.length, 0);
    assert.equal((await userRow(legacy)).access_version, 2);
  });

  test('PR-07: rollback rejects escalation to another scope and a regular grant with the same legacy pair', async () => {
    const granted = randomUUID();
    await insertUser(pool, { id: granted, role: 'ADMIN' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')", [granted]);
    await withPostgresTransaction(client => applyUserAccessChange(client, { userId: actor }, granted, {
      role: 'MODERATOR', reason: 'Cấp qua chức năng quản trị thông thường.'
    }));
    const result = await rollbackModeratorConversion({ userId: actor }, [
      { userId: granted, scope: 'MODERATOR' },
      { userId: lockedLegacy, scope: 'SUPER_ADMIN' }
    ], 'Kiểm tra nguồn gốc và nhóm quyền.');
    assert.equal(result.converted.length, 0);
    assert.deepEqual(result.reconciliation.map(entry => entry.userId), [granted, lockedLegacy]);
    for (const account of [granted, lockedLegacy]) {
      const row = await userRow(account);
      assert.equal(row.role, 'MODERATOR');
      assert.equal(row.scope, null);
      assert.equal(row.access_version, 1);
    }
  });

  test('PR-07: rollback reconciles a converted account revoked and granted moderator again', async () => {
    const target = randomUUID();
    await insertUser(pool, { id: target, role: 'ADMIN' });
    await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')", [target]);
    await convertLegacyModeratorAccounts({ userId: actor }, 'Chuyển đổi.', { accounts: [target] });
    for (const role of ['READER', 'MODERATOR'] as const) {
      await withPostgresTransaction(client => applyUserAccessChange(client, { userId: actor }, target, {
        role, reason: 'Thay đổi quyền sau khi chuyển đổi.'
      }));
    }
    const result = await rollbackModeratorConversion({ userId: actor }, [{ userId: target, scope: 'MODERATOR' }], 'Hoàn tác.');
    assert.equal(result.converted.length, 0);
    assert.equal(result.reconciliation.length, 1);
    assert.deepEqual(await userRow(target), {
      role: 'MODERATOR', scope: null, status: 'ACTIVE', access_version: 3
    });
  });

  test('PR-07: rollback reports accounts that no longer hold MODERATOR', async () => {
    const rollback = await rollbackModeratorConversion(
      { userId: actor },
      [{ userId: reader, scope: 'MODERATOR' }],
      'PR-07 rollback lệch'
    );
    assert.equal(rollback.reconciliation.length, 1);
    assert.equal(rollback.converted.length, 0);
    assert.equal((await userRow(reader)).role, 'READER');
  });

  test('PR-07: rollback rejects scopes outside the admin scope family', async () => {
    const rollback = await rollbackModeratorConversion(
      { userId: actor },
      [{ userId: legacy, scope: 'NOT_A_SCOPE' }],
      'PR-07 rollback scope sai'
    );
    assert.equal(rollback.reconciliation.length, 1);
    assert.equal(rollback.converted.length, 0);
  });

  test('PR-07: the shared grant command keeps unrelated author data untouched', async () => {
    env.MODERATOR_ENABLED = true;
    const fingerprint = async () =>
      (
        await pool.query(
          "select md5(string_agg(row_to_json(t)::text,',' order by novel_id)) as fingerprint from (select * from novels where author_id=$1) t",
          [author]
        )
      ).rows[0].fingerprint;
    const before = await fingerprint();
    const outcome = await withPostgresTransaction((client) =>
      applyUserAccessChange(client, { userId: actor }, legacy, {
        role: 'MODERATOR',
        reason: 'PR-07 qua lệnh cấp quyền chung'
      })
    );
    assert.equal(outcome.changed, true);
    assert.equal((await userRow(legacy)).role, 'MODERATOR');
    assert.equal(await fingerprint(), before);
    env.MODERATOR_ENABLED = false;
  });

  for (const operation of ['conversion', 'rollback'] as const) {
    test(`PR-07: ${operation} waits behind a normal access change and reconciles the new scope`, async () => {
      env.MODERATOR_ENABLED = true;
      const target = randomUUID();
      await insertUser(pool, { id: target, role: 'ADMIN' });
      await pool.query("insert into admin_access(user_id,scope) values($1,'MODERATOR')", [target]);
      const wasConverted = operation === 'rollback';
      if (wasConverted) {
        await convertLegacyModeratorAccounts({ userId: actor }, 'Chuyển đổi trước rollback.', { accounts: [target] });
      }

      const gate = await pool.connect();
      let inFlight: ReturnType<typeof convertLegacyModeratorAccounts> | undefined;
      try {
        await gate.query('begin');
        await gate.query("set local lock_timeout='3s'");
        await lockAdminAccess(gate);
        inFlight = operation === 'conversion'
          ? convertLegacyModeratorAccounts({ userId: actor }, 'Chuyển đổi legacy.', { accounts: [target] })
          : rollbackModeratorConversion({ userId: actor }, [{ userId: target, scope: 'MODERATOR' }], 'Hoàn tác.');
        await waitForBlockedTransaction(pool, gate);

        const changed = await applyUserAccessChange(gate, { userId: actor }, target, {
          role: 'ADMIN', scope: 'FINANCE', reason: 'Cấp quyền tài chính.'
        });
        assert.equal(changed.changed, true);
        await gate.query('commit');

        const result = await inFlight;
        assert.equal(result.converted.length, 0);
        assert.equal(result.skipped.length, 0);
        assert.equal(result.reconciliation.length, 1);
        assert.equal(result.reconciliation[0].userId, target);
        assert.equal(result.reconciliation[0].role, 'ADMIN');
        assert.equal(result.reconciliation[0].scope, 'FINANCE');
        assert.deepEqual(await userRow(target), {
          role: 'ADMIN', scope: 'FINANCE', status: 'ACTIVE', access_version: wasConverted ? 2 : 1
        });
        const audits = await pool.query(
          "select reason from admin_audit where affected_user_id=$1 and action='USER_ACCESS_CHANGED' and after_state->>'accessVersion'=$2",
          [target, wasConverted ? '2' : '1']
        );
        assert.deepEqual(audits.rows, [{ reason: 'Cấp quyền tài chính.' }]);
      } finally {
        await gate.query('rollback');
        gate.release();
        await inFlight;
      }
    });
  }
});
