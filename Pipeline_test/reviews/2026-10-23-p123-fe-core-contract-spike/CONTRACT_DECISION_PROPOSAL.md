# D1/D2 decision proposal — no policy approval implied

Final verdict: **BLOCKED_RUNTIME_OR_SOURCE_INCOMPATIBILITY**. Three new real-persistence FAIL rows block the current producer/consumer contract. D1/D2/D3 owner decisions also remain open. This spike recommends a versioned-writer contract and preserves Core's canonical writer; it does not authorize enforcing a new API policy or editing FE production code.

## D1: implemented behavior and smallest safe target

| Concern | Pipeline Core | PR #55 at 7b15c078 | Recommendation requiring OWNER_CORE + OWNER_FE approval |
|---|---|---|---|
| Version field | Optional schema/service expectedVersion; legacy missing-version save accepted | Optional schema, service requires title/content version and returns 428 DRAFT_VERSION_REQUIRED | Require nonnegative version for every title/content writer at the finalized cutover. Price-only exemption must be explicit. This breaks legacy editing clients and is NOT selected/applied here. Inventory/migrate clients or maintain a separately scoped legacy period with its lost-update risk explicitly accepted. |
| Initialization | A PG-only chapter has no Mongo draft; expectedVersion=0 initializes version 1 | Hook falls back to 0; repository supports expectedVersion=0 insert | Define absent draft as version 0, not a persisted version-0 document. Existing chapter creation normally returns draft version 1. No acceptance of stale v0 differing content after initialization. |
| Authoritative response | Pre-baseline PATCH version matches GET. **At anchored active baseline, response version 9 but Mongo version 10** after auto-snapshot reconciliation | Hook consumes PATCH draftVersion/draft.version directly for the next queued write | Return final durable version while still under the writer lease. Current Core is not compatible with that hook assumption at this checkpoint. No integrated-browser PASS follows from pre-baseline success. |
| Conflict | Differing stale body/title → 409 DRAFT_CONFLICT; caller must retain local text | Stale CAS → 409, hook preserves pending/recovery buffer | Refetch server version and show conflict; never silently rebase and overwrite. No automatic retry of a different stale payload. |
| Lost response | Same owner/novel/body/title retry can return current draft without a new version/revision/outbox. PG updated_at may be touched | Repository rejects stale same-payload retry; no Core replay fallback | Prefer retaining Core semantic replay, after binding *all requested semantic fields*, or approve an explicit GET-and-confirm recovery contract. PR55's current behavior is not transparent successful replay. |
| Whole payload | **New durable counterexample:** same stale body/title with changed isVip/priceCoins is accepted and PG pricing changes | No successful stale replay; differing stale payload rejects in repository | Preserve Core's useful body replay but reject changed requested pricing before side effects. Autosave/timestamps must have documented operational versus semantic treatment. Do not call the current body/title comparator a full request-idempotency guarantee. |

An additional active-baseline replay FAIL shows Mongo version 10 → 11 while the same immutable revision/outbox is retained; its PATCH response reports version 10. Canonical identity idempotence is therefore narrower than draft-version idempotence. The existing hook passes at its separate pre-baseline PR55 fixture but cannot establish safety against this Core path. A queued different B using returned version 9 against durable version 10 is expected to conflict; that consequence is source/API-contract inference, not an executed full-editor scenario.

Optional versions are backward compatible but cannot guarantee no lost updates while legacy unversioned writers share the same draft. Required versions can provide the stronger contract only after all relevant clients migrate or the owner explicitly accepts 428 for them. Merely mounting the PR55 hook does not resolve this owner decision. A new negotiated endpoint/header or durable save-request ledger would need a separate approved contract; this spike introduces neither.

## D2: keep the Core persistence spine

Keep updateChapter ownership admission → withChapterWriter → Mongo CAS → PG metadata → conditional automatic canonical snapshot/outbox, plus snapshot/accept use of the same lease and latest-only reconciliation. Keep accepted-generation idempotency, stale-base rejection, active Story Brain version checks and explicit author review. No PR55 chapter-service replacement.

The automatic-save condition is precise: narrative.story_brains must be active **and have baseline_revision_id**. An activated extract-from-idea baseline can be active with a null anchor; the first probe therefore correctly observed analysisRevisionId=null. That fixture does not prove automatic canonical persistence is broken. The second focused probe uses a real manuscript revision, supported human review and activation to test the applicable path. Owners must decide whether idea-only active/null-anchor behavior needs a separate future contract; no anchor is fabricated in SQL here.

Core retry assertions compare stable semantic metadata, draft version/content, immutable revision identity and outbox identity. They do not assert byte-identical timestamps or a distributed Mongo/PG transaction. The actual saved and accepted source hashes and proposal provenance are captured in durable readbacks. Future plan creation must not update official memory. Fake model output establishes wiring/provenance only.

PR55's explicit RevisionHistory snapshot preserves an explicit checkpoint on its own branch; its ordinary updateChapter does not call Core snapshotSavedChapter. That source difference remains a cutover blocker even though the earlier isolated hook/browser fixture passed. Reuse that evidence as inherited hook proof only, not integrated canonical persistence.

## Exact, unapplied backend patch proposal

The following insertions target updateChapterUnderLease in the current Core chapter service, after existingDraft is loaded and before Mongo CAS/PG metadata changes. **DO NOT APPLY until D1 policy/rollout and D2 replay fields are approved.** They are a proposal, not a tested composite or complete FE port.

```diff
 const existingDraft = await findDraftChapterByChapterId(chapterId);
+if ((input.title !== undefined || input.content !== undefined) && input.expectedVersion === undefined) {
+  throw new AppError(428, 'DRAFT_VERSION_REQUIRED', 'Read the draft version before saving');
+}
+if (existingDraft && input.expectedVersion !== undefined && input.expectedVersion < existingDraft.version &&
+    ((input.isVip !== undefined && input.isVip !== chapter.isVip) ||
+     (input.priceCoins !== undefined && input.priceCoins !== chapter.priceCoins))) {
+  throw new AppError(409, 'DRAFT_CONFLICT', 'Stale retry changes draft metadata; reload before retrying');
+}
```

Retain the existing withChapterWriter and repository replay implementation around these insertions. Review title fallback for published drafts separately: the FE tree prefers existingDraft.title, while Core currently uses chapter.title when title is omitted. Test that path before a published-draft cutover; publication is not exercised here.

Two additional **unapplied** D2 repair hunks are required by the new runtime failures:

```diff
 // updateChapterUnderLease, after snapshotSavedChapter has completed:
+const authoritativeDraft = await findDraftChapterByChapterId(chapterId);
 return {
   ...updatedChapter,
   analysisRevisionId: revision?.revisionId ?? null,
-  draftVersion: draft?.version ?? null
+  draftVersion: authoritativeDraft?.version ?? null
 };
```

Keep this read inside the existing withChapterWriter lease. In draft-chapters.repository.ts::syncDraftUnderLease, after loading `existing` and under the outer latest-revision/lease guard, propose a no-op for an already reconciled identical source:

```diff
 const existing = await collection().findOne({ chapterId: input.chapterId, deletedAt: null });
+if (existing && existing.lastAcceptedRevisionId === input.revisionId &&
+    existing.content === input.content && existing.wordCount === input.wordCount &&
+    (input.title === undefined || existing.title === input.title) &&
+    (input.novelId === undefined || existing.novelId === input.novelId) &&
+    (input.authorId === undefined || existing.authorId === input.authorId)) {
+  return { status: 'synced', draft: existing };
+}
```

This proposal preserves automatic canonical checkpoints rather than disabling them to fit PR55. Review and test the no-op alongside newer-draft protection, lease semantics, rollback/reconciliation bounds and accepted-source provenance before applying it. No claim that these unexecuted hunks fix the failures; they are exact review inputs. No production patch was made in this spike.

The proposed strict-version hunk changes legacy behavior and must not be smuggled into a test fix. The pricing hunk needs repeat tests for same/different payload, lost response, published pricing-only and body+pricing mutations after approval. No populated database migration is needed for this proposed comparator guard; no migration was run on a populated/shared target.

## S09 integration stop and FE-owned patch proposal

Full AuthorWritingIde cannot yet be accepted safely: the current pipeline editor still sends unversioned updates and returns on !hasChanged before clearing its debounce timer; PR55 uses a separate per-account/per-chapter hook and router blocker. Porting it requires FE-owned changes to the actual editor, API types, auth lifecycle, router and query cache. D1/D2 are not approved, so full-editor assembly and S09 execution stop here.

An exact *partial* FE hunk for the current inline triggerAutosave is to move the existing clearTimeout block before `if (!hasChanged) return`, and set autosaveTimeoutRef.current=null after clearing it. This addresses the undispatched temporary-A timer only; it does not solve in-flight ordering or account/route lifecycle and is not a substitute for the reviewed PR55 hook port. No FE file is edited or this hunk applied.

```diff
 const triggerAutosave = (newTitle: string, newContent: string, newIsVip: boolean, newPrice: number) => {
   if (!activeChapterId) return;
+  if (autosaveTimeoutRef.current) {
+    clearTimeout(autosaveTimeoutRef.current);
+    autosaveTimeoutRef.current = null;
+  }
   const hasChanged =
     newTitle !== lastSavedSnapshot.current.title ||
     newContent !== lastSavedSnapshot.current.content ||
     newIsVip !== lastSavedSnapshot.current.isVip ||
     newPrice !== lastSavedSnapshot.current.priceCoins;
   if (!hasChanged) return;
   setAutosaveStatus('saving');
-  if (autosaveTimeoutRef.current) {
-    clearTimeout(autosaveTimeoutRef.current);
-  }
```

This is an unapplied hunk against the current Core editor, not a cherry-pick into PR55's different hook implementation. Owner review must choose the final implementation and full acceptance coverage; do not close Issue56 from this proposed timer-only change.

FE-owned port acceptance must wire `initialize` to authoritative chapter/account identity, always send expectedVersion, serialize queued B behind A using returned draftVersion, retire old account slots synchronously, flush before snapshot/restore/accept, preserve local conflict/recovery buffers and block unsafe navigation. Keep Core entry points for entity review, official memory and active baseline. Then run the actual editor with auth/router on new DBs through all seven S09 scenarios in the user task. The previous mounted-hook browser test is not rerun here and cannot close Issue #56. S10/S11 remain separately gated.
