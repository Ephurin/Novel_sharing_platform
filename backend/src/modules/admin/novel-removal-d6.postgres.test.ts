import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { disconnectMongo, getMongoDatabase } from '../../core/database/mongo.js';
import { disconnectPostgres, getPostgresPool } from '../../core/database/postgres.js';
import { withPostgresTransaction } from '../../core/database/transaction.js';
import { validateTestDatabaseIsolation } from '../../core/database/test-db-guard.js';
import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import type { AuthContext } from '../../core/security/auth-context.js';
import { getChapter } from '../novels/chapters.service.js';
import { markDraftChaptersDeletedByNovelId } from '../novels/draft-chapters.repository.js';
import { readNovel } from '../novels/novels.service.js';
import { drainAdminJobs, retryAdminJob } from './admin-jobs.js';
import { applySanction } from './admin-sanctions.js';
import { removeNovel, restoreNovel } from './admin.service.js';

// D6 (product-owner sign-off 2026-11-10): Admin NOVEL HIDE hides the novel, its live chapters and their Mongo
// drafts; RESTORE brings back only what that sanction hid. PostgreSQL and MongoDB converge through the
// NOVEL_DRAFT_SYNC job (bounded retries, manual retry after FAILED). These tests inject real MongoDB write
// failures with a collection validator and check the final state, idempotency and fail-closed access.
describe('D6: admin novel hide/restore with Mongo draft sync', () => {
  const pool = getPostgresPool();
  const stamp = Date.now();
  const longText = 'Nội dung chương đủ dài cho kiểm thử gỡ và khôi phục truyện. '.repeat(10);
  const old = new Date('2026-01-01T00:00:00Z');
  let authorAuth: AuthContext;
  let adminAuth: AuthContext;
  let counter = 0;

  const drafts = () => getMongoDatabase().collection('draft_chapters');
  const draft = (chapterId: string) => drafts().findOne({ chapterId });

  async function user(role: string, name: string) {
    return (await pool.query(
      `insert into users (email, username, password_hash, role) values ($1, $2, 'hash', $3) returning user_id`,
      [`${name}-${stamp}@d6.test`, `${name}_${stamp}`, role]
    )).rows[0].user_id as string;
  }

  async function novel() {
    counter += 1;
    return (await pool.query(
      `insert into novels (author_id, title, slug, synopsis, status) values ($1, $2, $3, $4, 'PUBLISHED') returning novel_id`,
      [authorAuth.userId, `D6 ${stamp} ${counter}`, `d6-${stamp}-${counter}`, longText]
    )).rows[0].novel_id as string;
  }

  async function chapter(novelId: string, number: number, options: { deletedAt?: Date; draftDeletedAt?: Date | null } = {}) {
    const chapterId = (await pool.query(
      `insert into chapters (novel_id, title, chapter_number, content, status, deleted_at)
       values ($1, $2, $3, $4, 'PUBLISHED', $5) returning chapter_id`,
      [novelId, `Chương ${number}`, number, longText, options.deletedAt ?? null]
    )).rows[0].chapter_id as string;
    await drafts().insertOne({
      chapterId, novelId, authorId: authorAuth.userId, title: `Chương ${number}`, content: longText, wordCount: 100, version: 1,
      autosave: false, createdAt: old, updatedAt: old, deletedAt: options.draftDeletedAt ?? null,
      ...(options.draftDeletedAt ? { deletionReason: 'AUTHOR_DELETED' } : {})
    } as any);
    return chapterId;
  }

  // Every write to draft_chapters fails until the fault is cleared; reads still work.
  const mongoFault = (on: boolean) => getMongoDatabase().command({
    collMod: 'draft_chapters', validator: on ? { $jsonSchema: { required: ['__mongo_fault__'] } } : {},
    validationLevel: 'strict', validationAction: 'error'
  });
  const jobs = async (sanctionId: string) => (await pool.query(
    "select * from admin_jobs where kind = 'NOVEL_DRAFT_SYNC' and payload->>'sanctionId' = $1 order by job_order", [sanctionId])).rows;
  const makeDue = (jobId?: string) => pool.query(
    "update admin_jobs set next_attempt_at = now() where status = 'PENDING' and ($1::uuid is null or job_id = $1)", [jobId ?? null]);
  const sanctionOf = async (novelId: string) => (await pool.query(
    "select * from admin_sanctions where target_type = 'NOVEL' and target_id = $1 order by created_at desc limit 1", [novelId])).rows[0];
  const chapterDeleted = async (chapterId: string) =>
    (await pool.query('select deleted_at from chapters where chapter_id = $1', [chapterId])).rows[0].deleted_at !== null;

  async function assertHiddenFromEveryone(novelId: string, chapterId: string) {
    await assert.rejects(readNovel(novelId), (error: unknown) => error instanceof AppError && error.httpStatus === 404, 'guest cannot read the novel');
    await assert.rejects(readNovel(novelId, authorAuth), (error: unknown) => error instanceof AppError && error.httpStatus === 404, 'author cannot read the novel');
    await assert.rejects(getChapter(chapterId, authorAuth), (error: unknown) => error instanceof AppError && error.httpStatus === 404, 'author cannot open the chapter or its draft');
  }

  before(async () => {
    await validateTestDatabaseIsolation(pool, getMongoDatabase());
    authorAuth = { userId: await user('AUTHOR', 'd6_author'), role: 'AUTHOR' };
    const adminId = await user('ADMIN', 'd6_admin');
    await pool.query("insert into admin_access(user_id, scope) values ($1, 'SUPER_ADMIN')", [adminId]);
    adminAuth = { userId: adminId, role: 'ADMIN', adminScope: 'SUPER_ADMIN' };
  });

  // A failed assertion must not leave the injected fault on for the next test.
  beforeEach(async () => {
    await drafts().insertOne({ chapterId: `d6-probe-${stamp}-${counter++}`, novelId: 'd6-probe', deletedAt: old } as any).catch(() => undefined);
    await mongoFault(false);
  });

  after(async () => {
    await mongoFault(false).catch(() => undefined);
    await disconnectMongo();
    await disconnectPostgres();
  });

  test('transient Mongo failure: the job retries, converges, repeats are idempotent, unrelated drafts never change', async () => {
    const target = await novel(), other = await novel();
    const live = await chapter(target, 1);
    const authorDeleted = await chapter(target, 2, { deletedAt: old, draftDeletedAt: old });
    const authorDeletedLiveDraft = await chapter(target, 3, { deletedAt: old });
    const liveWithDeletedDraft = await chapter(target, 4, { draftDeletedAt: old });
    const unrelated = await chapter(other, 1);
    const untouched = async () => [
      await draft(authorDeleted), await draft(authorDeletedLiveDraft), await draft(liveWithDeletedDraft), await draft(unrelated)
    ];
    const baseline = await untouched();

    await mongoFault(true);
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 transient' });
    const sanction = await sanctionOf(target);
    let [job] = await jobs(sanction.sanction_id);
    assert.equal(job.status, 'PENDING');
    assert.equal(job.attempts, 1);
    assert.match(job.error, /validation/i, 'the Mongo failure is readable on the job');
    assert.ok(job.next_attempt_at > new Date(), 'the retry is scheduled with backoff');
    assert.equal((await draft(live))?.deletedAt, null, 'Mongo has not changed yet');
    await assertHiddenFromEveryone(target, live);

    await mongoFault(false);
    await makeDue();
    await drainAdminJobs();
    [job] = await jobs(sanction.sanction_id);
    assert.equal(job.status, 'DONE');
    assert.equal(job.attempts, 2);
    const hidden = await draft(live);
    assert.notEqual(hidden?.deletedAt, null);
    assert.equal(hidden?.adminSanctionId, sanction.sanction_id);

    // Running the same work again changes nothing.
    await pool.query("insert into admin_jobs(kind, payload) values ('NOVEL_DRAFT_SYNC', $1)", [{ sanctionId: sanction.sanction_id }]);
    await drainAdminJobs();
    assert.deepEqual(await draft(live), hidden);
    assert.deepEqual(await untouched(), baseline);

    await restoreNovel(adminAuth, target, { reason: 'D6 transient restore' });
    const restored = await draft(live);
    assert.equal(restored?.deletedAt, null);
    assert.equal(restored?.adminSanctionId, undefined);
    assert.equal(await chapterDeleted(live), false);
    assert.equal(await chapterDeleted(authorDeleted), true, 'a chapter the author deleted before HIDE stays deleted');
    assert.equal(await chapterDeleted(authorDeletedLiveDraft), true);
    assert.equal(await chapterDeleted(liveWithDeletedDraft), false, 'a chapter live at HIDE comes back, its earlier deleted draft does not');
    await pool.query("insert into admin_jobs(kind, payload) values ('NOVEL_DRAFT_SYNC', $1)", [{ sanctionId: sanction.sanction_id }]);
    await drainAdminJobs();
    assert.deepEqual(await draft(live), restored);
    assert.deepEqual(await untouched(), baseline, 'author-deleted drafts and other novels are never touched');

    const audit = (await pool.query(
      "select action from admin_audit where target_type = 'NOVEL' and target_id = $1 order by created_at", [target])).rows.map((row) => row.action);
    assert.deepEqual(audit, ['NOVEL_HIDE', 'SANCTION_RESTORED']);
  });

  test('terminal FAILED job: stays observable, access stays denied, admin manual retry recovers it', async () => {
    const target = await novel();
    const live = await chapter(target, 1);
    await mongoFault(true);
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 terminal' });
    const sanction = await sanctionOf(target);
    let [job] = await jobs(sanction.sanction_id);
    await pool.query('update admin_jobs set attempts = 5, next_attempt_at = now() where job_id = $1', [job.job_id]);
    await drainAdminJobs();
    [job] = await jobs(sanction.sanction_id);
    assert.equal(job.status, 'FAILED');
    assert.notEqual(job.failed_at, null);
    assert.match(job.error, /validation/i);

    await mongoFault(false);
    await makeDue();
    await drainAdminJobs();
    assert.equal((await jobs(sanction.sanction_id))[0].status, 'FAILED', 'a FAILED job is not retried on its own');
    assert.equal((await draft(live))?.deletedAt, null);
    await assertHiddenFromEveryone(target, live);

    await assert.rejects(retryAdminJob(authorAuth, job.job_id), 'only an admin may retry');
    const retried = await retryAdminJob(adminAuth, job.job_id);
    assert.equal(retried.status, 'PENDING');
    assert.equal(retried.retry_count, 1);
    const retryAudit = await pool.query("select reason from admin_audit where action = 'ADMIN_JOB_RETRIED' and target_id = $1", [job.job_id]);
    assert.equal(retryAudit.rowCount, 1, 'the manual retry is audited');
    await drainAdminJobs();
    assert.equal((await jobs(sanction.sanction_id))[0].status, 'DONE');
    assert.equal((await draft(live))?.adminSanctionId, sanction.sanction_id);
    await assertHiddenFromEveryone(target, live);
  });

  test('RESTORE while the HIDE sync is still pending: Mongo ends in the restored state', async () => {
    const target = await novel();
    const live = await chapter(target, 1);
    await mongoFault(true);
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 pending hide' });
    const sanction = await sanctionOf(target);
    await restoreNovel(adminAuth, target, { reason: 'D6 restore before sync' });
    const queued = await jobs(sanction.sanction_id);
    assert.equal(queued.length, 2, 'one job for the hide, one for the restore');
    assert.equal(queued[0].status, 'PENDING', 'the hide job is still waiting for its retry');
    await mongoFault(false);
    await makeDue();
    await drainAdminJobs();
    assert.deepEqual((await jobs(sanction.sanction_id)).map((job) => job.status), ['DONE', 'DONE']);
    assert.equal((await draft(live))?.deletedAt, null);
    assert.equal((await draft(live))?.adminSanctionId, undefined);
    assert.equal(await chapterDeleted(live), false);
    assert.equal((await readNovel(target)).novelId, target, 'the restored novel is readable again');
  });

  test('an old pending restore job cannot un-hide drafts of a novel that was hidden again', async () => {
    const target = await novel();
    const live = await chapter(target, 1);
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 first hide' });
    const first = await sanctionOf(target);
    assert.equal((await draft(live))?.adminSanctionId, first.sanction_id);

    await mongoFault(true);
    await restoreNovel(adminAuth, target, { reason: 'D6 restore, sync fails' });
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 second hide' });
    const second = await sanctionOf(target);
    assert.notEqual(second.sanction_id, first.sanction_id);
    await mongoFault(false);

    // The new hide job runs first; the stale restore job of the first sanction runs afterwards.
    const [hideJob] = await jobs(second.sanction_id);
    await makeDue(hideJob.job_id);
    await drainAdminJobs();
    await makeDue();
    await drainAdminJobs();
    const state = await draft(live);
    assert.notEqual(state?.deletedAt, null, 'the draft stays hidden: the latest sanction is active');
    assert.equal(state?.adminSanctionId, second.sanction_id);
    await assertHiddenFromEveryone(target, live);

    await restoreNovel(adminAuth, target, { reason: 'D6 final restore' });
    assert.equal((await draft(live))?.deletedAt, null);
    assert.equal((await draft(live))?.adminSanctionId, undefined);
  });

  test('legacy sanction without chapterIds: restore guesses nothing', async () => {
    const target = await novel();
    const hiddenByLegacy = await chapter(target, 1);
    const authorDeleted = await chapter(target, 2, { deletedAt: old, draftDeletedAt: old });
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 legacy' });
    const sanction = await sanctionOf(target);
    // A sanction recorded before chapterIds existed: no inventory of what it hid.
    await pool.query("update admin_sanctions set previous_state = previous_state - 'chapterIds' where sanction_id = $1", [sanction.sanction_id]);
    await drafts().updateMany({ novelId: target }, { $unset: { adminSanctionId: '' } });
    const before = [await draft(hiddenByLegacy), await draft(authorDeleted)];

    await restoreNovel(adminAuth, target, { reason: 'D6 legacy restore' });
    assert.equal((await pool.query('select deleted_at from novels where novel_id = $1', [target])).rows[0].deleted_at, null);
    assert.equal(await chapterDeleted(hiddenByLegacy), true, 'without an inventory the chapter is preserved as it is');
    assert.equal(await chapterDeleted(authorDeleted), true);
    assert.deepEqual([await draft(hiddenByLegacy), await draft(authorDeleted)], before, 'no draft is resurrected by guesswork');
  });

  test('removal from before sanctions existed: restore brings back only what the removal hid', async () => {
    const target = await novel();
    const removedWithNovel = await chapter(target, 1);
    const authorDeleted = await chapter(target, 2, { deletedAt: old, draftDeletedAt: old });
    // Review R5 (P1): the chapter was live when the novel was removed, but its draft had been deleted earlier.
    const liveWithDeletedDraft = await chapter(target, 3, { draftDeletedAt: old });
    // The pre-sanction removal stamped the novel and its then-live chapters in one transaction, then marked the
    // drafts that were still live, with the same helper that removal used.
    await withPostgresTransaction(async (client) => {
      await client.query('update novels set deleted_at = now() where novel_id = $1', [target]);
      await client.query('update chapters set deleted_at = coalesce(deleted_at, now()) where novel_id = $1', [target]);
      await markDraftChaptersDeletedByNovelId(target, 'removed');
    });
    const authorDraft = await draft(authorDeleted);
    const earlierDeletedDraft = await draft(liveWithDeletedDraft);
    assert.deepEqual(earlierDeletedDraft?.deletedAt, old, 'the old removal left an already deleted draft alone');

    await restoreNovel(adminAuth, target, { reason: 'D6 pre-sanction restore' });
    assert.equal(await chapterDeleted(removedWithNovel), false);
    assert.equal((await draft(removedWithNovel))?.deletedAt, null, 'the draft the removal hid comes back');
    assert.equal(await chapterDeleted(authorDeleted), true, 'a chapter deleted by the author earlier is not resurrected');
    assert.deepEqual(await draft(authorDeleted), authorDraft);
    assert.equal(await chapterDeleted(liveWithDeletedDraft), false, 'the chapter itself was live at removal and comes back');
    assert.deepEqual(await draft(liveWithDeletedDraft), earlierDeletedDraft, 'its draft deleted before the removal stays deleted, byte for byte');
  });

  test('while a novel is hidden nothing inside it can be deleted or sanctioned separately; an earlier chapter sanction survives the novel restore', async () => {
    const target = await novel();
    const live = await chapter(target, 1);
    const sanctionedEarlier = await chapter(target, 2);
    await withPostgresTransaction((client) => applySanction(client, adminAuth, { targetType: 'CHAPTER', targetId: sanctionedEarlier, action: 'HIDE', reason: 'D6 chapter hide' }));
    await removeNovel(adminAuth, target, { confirm: true, reason: 'D6 hide' });

    const { createApp } = await import('../../app.js');
    const jwt = (await import('jsonwebtoken')).default;
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
      const headers = { Authorization: `Bearer ${jwt.sign({ sub: authorAuth.userId, role: 'AUTHOR' }, env.JWT_ACCESS_SECRET)}`, 'Content-Type': 'application/json' };
      assert.equal((await fetch(`${base}/chapters/${live}`, { method: 'DELETE', headers })).status, 404, 'the author cannot delete a chapter of a hidden novel');
      assert.equal((await fetch(`${base}/chapters/${live}/archive`, { method: 'POST', headers, body: '{}' })).status, 404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await assert.rejects(
      withPostgresTransaction((client) => applySanction(client, adminAuth, { targetType: 'CHAPTER', targetId: live, action: 'HIDE', reason: 'D6 second' })),
      (error: unknown) => error instanceof AppError && error.code === 'ADMIN_SANCTION_ACTIVE');

    await restoreNovel(adminAuth, target, { reason: 'D6 restore' });
    assert.equal(await chapterDeleted(live), false);
    assert.equal(await chapterDeleted(sanctionedEarlier), true, 'the chapter hidden by its own sanction is not restored by the novel restore');
  });
});
