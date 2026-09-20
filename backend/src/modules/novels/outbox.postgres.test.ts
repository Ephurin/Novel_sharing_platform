import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPostgresPool, disconnectPostgres } from '../../core/database/postgres.js';
import {
  claimPendingOutboxEvents,
  insertOutboxEvent,
  markOutboxEventCompleted,
  markOutboxEventFailed,
} from './outbox.repository.js';

describe('PostgreSQL Outbox Multi-Worker Lease Fencing Integration', () => {
  const pool = getPostgresPool();
  let userId: string;
  let novelId: string;
  let chapterId: string;
  let revisionId: string;

  before(async () => {
    // Setup test dependencies
    const userRes = await pool.query(
      `insert into users (email, username, password_hash)
       values ($1, $2, 'dummy-hash')
       returning user_id`,
      [`outbox-tester-${Date.now()}@ephurin.com`, `tester_${Date.now()}`]
    );
    userId = userRes.rows[0].user_id;

    const novelRes = await pool.query(
      `insert into novels (author_id, title, slug, synopsis)
       values ($1, 'Test Outbox Novel', $2, 'Synopsis test outbox')
       returning novel_id`,
      [userId, `outbox-novel-${Date.now()}`]
    );
    novelId = novelRes.rows[0].novel_id;

    const chapRes = await pool.query(
      `insert into chapters (novel_id, chapter_number, title)
       values ($1, 1, 'Chương 1')
       returning chapter_id`,
      [novelId]
    );
    chapterId = chapRes.rows[0].chapter_id;

    const revRes = await pool.query(
      `insert into chapter_revisions (novel_id, chapter_id, content_hash, content, word_count, created_by)
       values ($1, $2, $3, 'Nội dung test', 3, $4)
       returning revision_id`,
      [novelId, chapterId, 'h'.repeat(64), userId]
    );
    revisionId = revRes.rows[0].revision_id;
  });

  after(async () => {
    // Cleanup test data
    if (novelId) {
      await pool.query('delete from novels where novel_id = $1', [novelId]);
    }
    if (userId) {
      await pool.query('delete from users where user_id = $1', [userId]);
    }
    await disconnectPostgres();
  });

  test('Two concurrent PostgreSQL workers claim queue: exactly one worker claims active token', async () => {
    // Insert a pending event
    const event = await insertOutboxEvent(undefined, {
      eventType: 'CONCURRENCY_TEST',
      novelId,
      chapterId,
      revisionId,
      contentHash: 'h'.repeat(64),
      createdBy: userId,
    });

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      await client1.query('BEGIN');
      await client2.query('BEGIN');

      // Both workers claim concurrently
      const [claimed1, claimed2] = await Promise.all([
        claimPendingOutboxEvents(client1, 1),
        claimPendingOutboxEvents(client2, 1),
      ]);

      await client1.query('COMMIT');
      await client2.query('COMMIT');

      const eventClaimed1 = claimed1.filter((e) => e.eventId === event.eventId);
      const eventClaimed2 = claimed2.filter((e) => e.eventId === event.eventId);
      const totalClaimed = eventClaimed1.length + eventClaimed2.length;
      assert.equal(totalClaimed, 1, 'Exactly one worker must claim the specific event');

      const activeEvent = eventClaimed1.length > 0 ? eventClaimed1[0] : eventClaimed2[0];
      assert.equal(activeEvent.eventId, event.eventId);
      assert.ok(activeEvent.claimToken, 'Claimed event must have a non-null claim_token');
      assert.equal(activeEvent.status, 'PROCESSING');
    } finally {
      client1.release();
      client2.release();
    }
  });

  test('Lease expiry and reclaim: stale worker token affects 0 rows, new active worker completes', async () => {
    // Insert pending event for lease expiry test
    const revRes2 = await pool.query(
      `insert into chapter_revisions (novel_id, chapter_id, content_hash, content, word_count, created_by)
       values ($1, $2, $3, 'Nội dung test 2', 4, $4)
       returning revision_id`,
      [novelId, chapterId, '2'.repeat(64), userId]
    );
    const rev2Id = revRes2.rows[0].revision_id;

    const event = await insertOutboxEvent(undefined, {
      eventType: 'LEASE_FENCING_TEST',
      novelId,
      chapterId,
      revisionId: rev2Id,
      contentHash: '2'.repeat(64),
      createdBy: userId,
    });

    // Worker 1 claims event
    const client1 = await pool.connect();
    let token1: string | null = null;
    try {
      await client1.query('BEGIN');
      const claimed1 = await claimPendingOutboxEvents(client1, 10);
      await client1.query('COMMIT');

      const target = claimed1.find((e) => e.eventId === event.eventId);
      assert.ok(target, 'Worker 1 should claim the event');
      token1 = target.claimToken;
      assert.ok(token1, 'Worker 1 should receive claimToken');
    } finally {
      client1.release();
    }

    // Worker 1 hangs/crashes... Simulate lease expiry (> 300s)
    await pool.query(
      `update revision_outbox_events
       set updated_at = now() - interval '305 seconds'
       where event_id = $1`,
      [event.eventId]
    );

    // Worker 2 reclaims the expired event
    const client2 = await pool.connect();
    let token2: string | null = null;
    try {
      await client2.query('BEGIN');
      const claimed2 = await claimPendingOutboxEvents(client2, 10);
      await client2.query('COMMIT');

      const target2 = claimed2.find((e) => e.eventId === event.eventId);
      assert.ok(target2, 'Worker 2 should reclaim the expired event');
      token2 = target2.claimToken;
      assert.ok(token2, 'Worker 2 should receive a new claimToken');
      assert.notEqual(token1, token2, 'Worker 2 must receive a fresh distinct claimToken');
    } finally {
      client2.release();
    }

    // Stale Worker 1 wakes up and attempts to mark completed with token1 -> affects 0 rows
    const staleCompleted = await markOutboxEventCompleted(undefined, event.eventId, token1);
    assert.equal(staleCompleted, false, 'Stale worker 1 finalize must affect 0 rows');

    // Stale Worker 1 attempts to mark failed with token1 -> affects 0 rows
    const staleFailed = await markOutboxEventFailed(undefined, event.eventId, 'Stale error', 10, token1);
    assert.equal(staleFailed, false, 'Stale worker 1 fail must affect 0 rows');

    // Verify event is still PROCESSING with token2
    const verifyRes = await pool.query(
      `select status, claim_token from revision_outbox_events where event_id = $1`,
      [event.eventId]
    );
    assert.equal(verifyRes.rows[0].status, 'PROCESSING');
    assert.equal(verifyRes.rows[0].claim_token, token2);

    // Active Worker 2 marks completed with token2 -> succeeds!
    const activeCompleted = await markOutboxEventCompleted(undefined, event.eventId, token2);
    assert.equal(activeCompleted, true, 'Active worker 2 finalize must succeed');

    const finalRes = await pool.query(
      `select status from revision_outbox_events where event_id = $1`,
      [event.eventId]
    );
    assert.equal(finalRes.rows[0].status, 'COMPLETED');
  });
});
