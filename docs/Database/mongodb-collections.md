# MongoDB Collections

MongoDB stores flexible, high-volume, or log-like data. PostgreSQL remains the source of truth for relational business state.

## 1. draft_chapters

Stores autosaved and editable chapter drafts.

```json
{
  "_id": "draft_123",
  "chapterId": "chapter_123",
  "novelId": "novel_123",
  "authorId": "user_author_1",
  "title": "Chapter 1: The Door",
  "content": "Current draft content...",
  "wordCount": 1200,
  "version": 7,
  "autosave": true,
  "createdAt": "2026-07-15T10:00:00Z",
  "updatedAt": "2026-07-15T10:30:00Z"
}
```

**Indexes**

- `{ "chapterId": 1, "updatedAt": -1 }`
- `{ "novelId": 1, "authorId": 1 }`

**Review Notes**

- MVP keeps only the latest active draft document per `chapterId`.
- Every save increments `version`.
- Full draft history is deferred.

## 2. comments

Stores chapter and inline comments.

```json
{
  "_id": "comment_123",
  "commentId": "comment_uuid_123",
  "chapterId": "chapter_123",
  "novelId": "novel_123",
  "userId": "user_reader_1",
  "paragraphOffset": 12,
  "content": "This paragraph is beautiful.",
  "status": "APPROVED",
  "aiEvidenceId": null,
  "moderationReviewId": null,
  "createdAt": "2026-07-15T10:00:00Z",
  "updatedAt": "2026-07-15T10:00:00Z",
  "deletedAt": null
}
```

**Indexes**

- `{ "commentId": 1 }` unique
- `{ "chapterId": 1, "status": 1, "paragraphOffset": 1 }`
- `{ "userId": 1, "createdAt": -1 }`
- `{ "status": 1, "createdAt": -1 }`

**Review Notes**

- `paragraphOffset` is nullable for chapter-level comments.
- Admin review state is mirrored in PostgreSQL `moderation_reviews` when moderation is needed.
- API and moderation should use `commentId`; Mongo `_id` remains internal.

## 3. notifications

Stores in-app notifications and push notification payload logs.

```json
{
  "_id": "notification_123",
  "userId": "user_reader_1",
  "type": "NEW_CHAPTER",
  "status": "UNREAD",
  "title": "New chapter published",
  "content": "The Moonlit Archive has a new chapter.",
  "payload": {
    "novelId": "novel_123",
    "chapterId": "chapter_123"
  },
  "push": {
    "provider": "FCM",
    "sent": true,
    "sentAt": "2026-07-15T10:00:00Z",
    "error": null
  },
  "createdAt": "2026-07-15T10:00:00Z",
  "readAt": null
}
```

**Indexes**

- `{ "userId": 1, "status": 1, "createdAt": -1 }`
- `{ "type": 1, "createdAt": -1 }`

## 4. device_tokens

Stores push notification device tokens.

```json
{
  "_id": "device_token_123",
  "userId": "user_reader_1",
  "provider": "FCM",
  "deviceTokenHash": "sha256_hash",
  "platform": "ANDROID",
  "active": true,
  "createdAt": "2026-07-15T10:00:00Z",
  "updatedAt": "2026-07-15T10:00:00Z",
  "lastUsedAt": "2026-07-15T10:00:00Z"
}
```

**Indexes**

- `{ "userId": 1, "active": 1 }`
- `{ "deviceTokenHash": 1 }` unique

## 5. activity_logs

Stores internal audit trails.

```json
{
  "_id": "activity_123",
  "actorId": "user_admin_1",
  "actorRole": "ADMIN",
  "action": "APPROVE_CHAPTER",
  "targetType": "CHAPTER",
  "targetId": "chapter_123",
  "metadata": {
    "previousStatus": "PENDING_MODERATION",
    "newStatus": "PUBLISHED"
  },
  "ipAddress": "127.0.0.1",
  "userAgent": "Mozilla/5.0",
  "createdAt": "2026-07-15T10:00:00Z"
}
```

**Indexes**

- `{ "actorId": 1, "createdAt": -1 }`
- `{ "targetType": 1, "targetId": 1 }`
- `{ "action": 1, "createdAt": -1 }`

## 6. moderation_evidence

Stores rule/filter and report evidence for moderation queue. This collection is owned by Content Control & Moderation, not AI Intelligence.

```json
{
  "_id": "evidence_123",
  "targetType": "CHAPTER",
  "targetId": "chapter_123",
  "riskLevel": "HIGH",
  "source": "KEYWORD_FILTER",
  "matchedRules": ["toxic_phrase_rule_001"],
  "categories": ["POLICY_VIOLATION"],
  "highlights": [
    {
      "startOffset": 100,
      "endOffset": 180,
      "reason": "Rule/list phrase detected"
    }
  ],
  "summary": "Rule/filter evidence summary for Admin review.",
  "createdAt": "2026-07-15T10:00:00Z"
}
```

**Indexes**

- `{ "targetType": 1, "targetId": 1 }`
- `{ "riskLevel": 1, "createdAt": -1 }`
- `{ "source": 1, "createdAt": -1 }`

**Review Notes**

- Avoid storing full raw model prompts if they include sensitive/private user text beyond what Admin needs.

## 7. copilot_generation_logs

Stores request/response trace for Writing Copilot debugging and audit.

```json
{
  "_id": "copilot_log_123",
  "requestType": "SUGGESTION",
  "suggestionId": "suggestion_123",
  "checkId": null,
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "authorId": "user_author_1",
  "instruction": "Continue the scene with a tense discovery.",
  "additionalContextTextPreview": "Earlier in the novel...",
  "includedContext": {
    "characters": true,
    "timeline": true,
    "plotSummaries": true
  },
  "draftSuggestion": "Suggested continuation...",
  "consistencyWarnings": [],
  "contextProposalIds": ["proposal_123"],
  "model": "llm-model-name",
  "latencyMs": 1800,
  "status": "SUCCESS",
  "error": null,
  "createdAt": "2026-07-15T10:00:00Z"
}
```

For consistency checks, use the same collection with `requestType = "CONSISTENCY_CHECK"`:

```json
{
  "_id": "copilot_log_456",
  "requestType": "CONSISTENCY_CHECK",
  "suggestionId": null,
  "checkId": "check_123",
  "novelId": "novel_123",
  "chapterId": "chapter_123",
  "authorId": "user_author_1",
  "additionalContextTextPreview": "Cael should not know...",
  "includedContext": {
    "characters": true,
    "timeline": true,
    "plotSummaries": true
  },
  "contextHealthScore": 86,
  "consistencyWarnings": [
    {
      "warningId": "warning_123",
      "severity": "MEDIUM",
      "type": "TIMELINE_CONFLICT",
      "message": "Cael appears to know the archive door's true name before the reveal event.",
      "relatedContext": [
        {
          "targetType": "STORY_TIMELINE",
          "targetId": "event_42"
        }
      ],
      "suggestedAction": "Revise Cael's line or create a timeline update proposal."
    }
  ],
  "model": "llm-model-name",
  "latencyMs": 1600,
  "status": "SUCCESS",
  "error": null,
  "createdAt": "2026-07-15T10:00:00Z"
}
```

**Indexes**

- `{ "novelId": 1, "createdAt": -1 }`
- `{ "authorId": 1, "createdAt": -1 }`
- `{ "requestType": 1, "createdAt": -1 }`
- `{ "suggestionId": 1 }` unique
- `{ "checkId": 1 }` unique sparse

**Review Notes**

- `draftSuggestion` is retained for 90 days for debugging.
- `consistencyWarnings` can be retained for 90 days for debugging and Author review.
- `additionalContextTextPreview` is truncated for logging.
- Full temporary context is not stored by default.

## 8. search_cache_snapshots (Optional)

Optional Mongo cache/materialized snapshot if Redis alone is not enough for search browse pages.

```json
{
  "_id": "search_snapshot_123",
  "cacheKey": "genre:FANTASY:page:1",
  "results": [
    {
      "novelId": "novel_123",
      "title": "The Moonlit Archive",
      "score": 0.98
    }
  ],
  "expiresAt": "2026-07-15T11:00:00Z",
  "createdAt": "2026-07-15T10:00:00Z"
}
```

**Review Notes**

- This is optional. Prefer Redis for cache-first MVP.

## Approved Decisions Applied

- `copilot_generation_logs.draftSuggestion` is retained for 90 days.
- `copilot_generation_logs.consistencyWarnings` is retained for 90 days when generated by consistency checks.
- `additionalContextTextPreview` is truncated and full temporary context is not stored by default.
- Comments include UUID `commentId` in addition to Mongo `_id`.
- Moderation evidence and Copilot logs are retained for 90 days in MVP.
