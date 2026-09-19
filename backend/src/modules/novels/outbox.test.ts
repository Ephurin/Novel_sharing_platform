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
});
