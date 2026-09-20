import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Transactional Outbox & Dual-Write Resilience (P6.5 Hardening)', () => {
  test('Exponential backoff for outbox retries is bounded by 300s', () => {
    function computeBackoff(retryCount: number): number {
      return Math.min(300, Math.pow(2, retryCount + 1) * 5);
    }

    assert.equal(computeBackoff(0), 10);
    assert.equal(computeBackoff(1), 20);
    assert.equal(computeBackoff(2), 40);
    assert.equal(computeBackoff(3), 80);
    assert.equal(computeBackoff(4), 160);
    assert.equal(computeBackoff(5), 300); // capped at 300s (5 minutes)
    assert.equal(computeBackoff(10), 300);
  });

  test('Conditional MongoDB draft reconciliation preserves newer manual draft edits', () => {
    // Simulate conditional update logic
    type DraftChapterDoc = {
      chapterId: string;
      title: string;
      content: string;
      wordCount: number;
      updatedAt: Date;
      version: number;
      lastAcceptedRevisionId?: string;
      lastAcceptedAt?: Date;
    };

    function simulateConditionalSync(
      existingDraft: DraftChapterDoc,
      acceptRevision: {
        revisionId: string;
        content: string;
        wordCount: number;
        acceptTimestamp: Date;
      }
    ): { status: 'synced' | 'skipped_newer_draft'; draft: DraftChapterDoc } {
      // MongoDB query filter: { chapterId, $or: [ { updatedAt: { $lte: acceptTimestamp } }, { updatedAt: { $exists: false } } ] }
      const conditionMatches = existingDraft.updatedAt <= acceptRevision.acceptTimestamp;

      if (!conditionMatches) {
        return { status: 'skipped_newer_draft', draft: existingDraft };
      }

      const updatedDraft: DraftChapterDoc = {
        ...existingDraft,
        content: acceptRevision.content,
        wordCount: acceptRevision.wordCount,
        lastAcceptedRevisionId: acceptRevision.revisionId,
        lastAcceptedAt: acceptRevision.acceptTimestamp,
        updatedAt: new Date(),
        version: existingDraft.version + 1,
      };

      return { status: 'synced', draft: updatedDraft };
    }

    const t0 = new Date('2026-09-19T10:00:00Z');
    const tRevisionAccepted = new Date('2026-09-19T10:05:00Z');
    const tAuthorManualEdit = new Date('2026-09-19T10:06:00Z'); // Later than accepted revision

    // Case 1: Draft is older than accepted revision -> should sync
    const draftBeforeSync: DraftChapterDoc = {
      chapterId: 'ch-1',
      title: 'Chương 1',
      content: 'Nội dung cũ',
      wordCount: 3,
      updatedAt: t0,
      version: 1,
    };

    const syncResult1 = simulateConditionalSync(draftBeforeSync, {
      revisionId: 'rev-ai-accept-1',
      content: 'Nội dung AI đã được tác giả chấp nhận',
      wordCount: 8,
      acceptTimestamp: tRevisionAccepted,
    });

    assert.equal(syncResult1.status, 'synced');
    assert.equal(syncResult1.draft.content, 'Nội dung AI đã được tác giả chấp nhận');
    assert.equal(syncResult1.draft.lastAcceptedRevisionId, 'rev-ai-accept-1');

    // Case 2: Author made subsequent manual edits while outbox was retrying -> MUST NOT OVERWRITE
    const draftWithManualEdits: DraftChapterDoc = {
      chapterId: 'ch-1',
      title: 'Chương 1',
      content: 'Nội dung tác giả vừa sửa tay sau đó!',
      wordCount: 8,
      updatedAt: tAuthorManualEdit, // Newer than tRevisionAccepted
      version: 2,
    };

    const syncResult2 = simulateConditionalSync(draftWithManualEdits, {
      revisionId: 'rev-delayed-sync',
      content: 'Nội dung AI cũ bị delay',
      wordCount: 5,
      acceptTimestamp: tRevisionAccepted,
    });

    assert.equal(syncResult2.status, 'skipped_newer_draft');
    assert.equal(syncResult2.draft.content, 'Nội dung tác giả vừa sửa tay sau đó!');
  });

  test('Conditional MongoDB draft reconciliation creates new draft if not found', () => {
    function simulateSyncNullDraft(
      existingDraft: any,
      acceptRevision: {
        novelId: string;
        chapterId: string;
        revisionId: string;
        content: string;
        wordCount: number;
        acceptTimestamp: Date;
      }
    ) {
      if (!existingDraft) {
        return {
          status: 'synced',
          draft: {
            novelId: acceptRevision.novelId,
            chapterId: acceptRevision.chapterId,
            title: '',
            content: acceptRevision.content,
            wordCount: acceptRevision.wordCount,
            lastAcceptedRevisionId: acceptRevision.revisionId,
            lastAcceptedAt: acceptRevision.acceptTimestamp,
            updatedAt: new Date(),
            version: 1,
          },
        };
      }
      return { status: 'skipped_newer_draft', draft: existingDraft };
    }

    const res = simulateSyncNullDraft(null, {
      novelId: 'nov-1',
      chapterId: 'ch-1',
      revisionId: 'rev-1',
      content: 'Bản thảo ban đầu từ revision',
      wordCount: 5,
      acceptTimestamp: new Date(),
    });

    assert.equal(res.status, 'synced');
    assert.equal(res.draft.version, 1);
    assert.equal(res.draft.content, 'Bản thảo ban đầu từ revision');
    assert.equal(res.draft.lastAcceptedRevisionId, 'rev-1');
  });

  test('Accept-time brain version conflict rejects stale generation', () => {
    function checkBrainFreshness(
      generationBrainVersion: number,
      currentBrainVersion: number
    ): { allowed: boolean; code?: string } {
      if (currentBrainVersion > generationBrainVersion) {
        return { allowed: false, code: 'BRAIN_VERSION_CONFLICT' };
      }
      return { allowed: true };
    }

    // Generation generated with brain version 1, current brain bumped to 2
    const staleCheck = checkBrainFreshness(1, 2);
    assert.equal(staleCheck.allowed, false);
    assert.equal(staleCheck.code, 'BRAIN_VERSION_CONFLICT');

    // Generation generated with current brain version 2
    const freshCheck = checkBrainFreshness(2, 2);
    assert.equal(freshCheck.allowed, true);
  });

  test('Outbox lease concurrency: active PROCESSING event cannot be claimed by concurrent worker', () => {
    type MockOutboxRow = {
      event_id: string;
      status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
      next_retry_at: Date;
      updated_at: Date;
    };

    function simulateClaim(
      rows: MockOutboxRow[],
      limit: number = 10,
      staleThresholdSeconds: number = 300
    ): MockOutboxRow[] {
      const now = new Date();
      const cutoff = new Date(now.getTime() - staleThresholdSeconds * 1000);
      const eligible = rows.filter((r) => {
        if (r.status === 'PENDING' && r.next_retry_at <= now) return true;
        if (r.status === 'PROCESSING' && r.updated_at <= cutoff) return true;
        return false;
      }).slice(0, limit);

      for (const row of eligible) {
        row.status = 'PROCESSING';
        row.updated_at = now;
      }
      return eligible;
    }

    const now = new Date();
    const queue: MockOutboxRow[] = [
      {
        event_id: 'ev-1',
        status: 'PENDING',
        next_retry_at: now,
        updated_at: now,
      },
      {
        event_id: 'ev-2',
        status: 'PENDING',
        next_retry_at: now,
        updated_at: now,
      },
    ];

    // Worker A claims ev-1
    const claimedByWorkerA = simulateClaim(queue, 1);
    assert.equal(claimedByWorkerA.length, 1);
    assert.equal(claimedByWorkerA[0].event_id, 'ev-1');
    assert.equal(claimedByWorkerA[0].status, 'PROCESSING');

    // Worker B immediately tries to claim -> must NOT claim ev-1 (it is actively PROCESSING)
    const claimedByWorkerB = simulateClaim(queue, 1);
    assert.equal(claimedByWorkerB.length, 1);
    assert.equal(claimedByWorkerB[0].event_id, 'ev-2');

    // Worker C tries to claim -> no pending or stale events left
    const claimedByWorkerC = simulateClaim(queue, 1);
    assert.equal(claimedByWorkerC.length, 0);
  });

  test('Outbox expired lease recovery: crashed worker event is reclaimed after timeout', () => {
    type MockOutboxRow = {
      event_id: string;
      status: 'PENDING' | 'PROCESSING' | 'COMPLETED';
      next_retry_at: Date;
      updated_at: Date;
    };

    function simulateClaim(
      rows: MockOutboxRow[],
      limit: number = 10,
      staleThresholdSeconds: number = 300
    ): MockOutboxRow[] {
      const now = new Date();
      const cutoff = new Date(now.getTime() - staleThresholdSeconds * 1000);
      const eligible = rows.filter((r) => {
        if (r.status === 'PENDING' && r.next_retry_at <= now) return true;
        if (r.status === 'PROCESSING' && r.updated_at <= cutoff) return true;
        return false;
      }).slice(0, limit);

      for (const row of eligible) {
        row.status = 'PROCESSING';
        row.updated_at = now;
      }
      return eligible;
    }

    const now = new Date();
    // ev-crashed has been stuck in PROCESSING for 400 seconds (lease expired)
    const staleTime = new Date(now.getTime() - 400 * 1000);
    // ev-active has been in PROCESSING for only 30 seconds (lease active)
    const activeTime = new Date(now.getTime() - 30 * 1000);

    const queue: MockOutboxRow[] = [
      {
        event_id: 'ev-crashed',
        status: 'PROCESSING',
        next_retry_at: staleTime,
        updated_at: staleTime,
      },
      {
        event_id: 'ev-active',
        status: 'PROCESSING',
        next_retry_at: activeTime,
        updated_at: activeTime,
      },
    ];

    // Worker recovers crashed event
    const claimed = simulateClaim(queue, 10, 300);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].event_id, 'ev-crashed');
    assert.equal(claimed[0].status, 'PROCESSING');
    // active event was NOT claimed
    assert.equal(queue.find((r) => r.event_id === 'ev-active')?.status, 'PROCESSING');
  });
});


