# UX-05 Stage 0 — contract proposal, NOT an enabled API

Issue #114. Baseline `30dc39e1ee8c9f683f41301825ccc1294159375f` (PR #108).
**CONTRACT_BLOCKED. GPT-6 contract review required before implementation or migration.**
No original setup unlock, direct accepted-fact UPDATE, fake chapter/event or Canon bypass.

## Observed authority table

| Operation | Current allowed lifecycle | CAS/server identity | Authority/persistence | Readback/context |
|---|---|---|---|---|
| Edit an unsubmitted declaration | Before source submit | Stable declaration IDs, next expected_setup_version on submit | Device draft only until setup-v1 POST | No accepted fact/context change |
| Edit pending review card | Latest setup waiting_review, Brain not active, undecided complete group | setup hash/version + review version + Brain version; proposal/group UUIDs | Full-group accept/reject, raw source/proposal preserved; decision audit + confirmed static fact on accept | Existing review readback; no history/revision needed |
| Amend accepted rule before M0 | No supported correction path | Existing review is terminal; a fresh Brain token does not rebase its prior decision audit | Resubmitting/reopening accepted setup is not an amendment | M0 requires exact original artifacts and review Brain version; counter change yields M0_REVIEW_STALE |
| Amend accepted rule after verified M0 / M-FIRST | No supported correction path | No versioned amendment DTO/receipt/head policy | Fact columns alone are not an acceptance transaction | Approved Memory resolves replacements but Writing Context does not; locked and unlocked old rules can both reach writing |
| Add rule/entity after accepted setup | Raw bootstrap snapshots exist pre-M0, but no authorized additive UX-05 contract; active Brain bootstrap guard remains | New snapshot/latest-source/group/identity requirements still apply | Do not resubmit accepted input as an addendum | No automatic adoption or retroactive chapter processing; separate follow-up |
| Correct historical Canon event/fact | P1 event correction exists for real immutable chapter source; not a static-rule API | Event ID, original immutable chapter, full dependency group/Brain CAS | Append event correction and sourced transitions | Never manufacture an event or chapter to carry a setup rule |

Accepted != locked. setup_review creates confirmed world-rule FactRecord with the default unlocked flag; explicit lock metadata is independent. World Setup has no source_revision_id/chapter_number. A narrative extracted world_rule can have those fields: fact_type alone does not authorize UX-05 mutation.

## Concrete missing foundations

1. `FactRecord`/migration0010 provide supersedes_id/is_retired, but no trusted rule-amendment operation, scoped parent/head guard or reviewed lifecycle contract. The generic fact materializer inserts a new AI-source fact; it does not materialize a supersession edge and can create initial-state transitions for subjects. Pending-card edits cannot change protected source fields. P1 event correction is not reusable by inventing historical evidence.
2. `api/entity_hitl_routes.py:memory` removes replaced/retired facts. `PostgresNarrativeRepository.get_structured_context` selects confirmed facts, applies chapter cutoffs, then exposes both versions; it has no fact replacement/retirement resolution. `WritingService.preview_context` consumes this package. Budget packing does not make it safe. A retired locked parent can still be mandatory writing context. `_projection_inputs` also loads all facts without those flags; fixing only the Memory UI is insufficient.
3. M0 eligibility binds the original supported-card decisions/artifact IDs/values and exact setup-review Brain version. A legitimate amendment must increment Brain; before M0, even a fresh request token then fails M0_REVIEW_STALE. Retiring the original artifact would separately fail M0_ARTIFACT_INCONSISTENT. These checks must not be weakened or their old receipts rewritten.
4. Source readback is an immutable review receipt, not a typed effective-rule version/head view. A future API must return stable root/current IDs and their audit chain; matching text or fact_key is insufficient.

Real PG diagnostic probes on a verified M0 (test-only hypothetical chain inserts, never production writes) compare Memory and the actual WritingService preview. For both lock flags Memory selects the leaf while writing includes the retired parent and leaf. A separate probe advances only Brain's counter and confirms M0 denial has no activation side effects. These probes confirm blockers; their PASS is **not** accepted-amendment feature PASS.

## Smallest proposed first slice (requires approval)

Start with **one global, already accepted World Setup rule after verified M0/M-FIRST**, author initiated, no model, no subject-bound rule/entity additions, no lock toggling, no pre-M0 amendments. Fail closed on unsupported/legacy/unverified provenance. Reuse existing facts/proposals/decisions/run receipt infrastructure; no second authority store. Do not add a migration until existing-row inventory and contract approval show a need.

Proposed routes (NOT implemented):

```text
POST /ai/story-brains/{novelId}/setup-rule-amendments
GET  /ai/story-brains/{novelId}/setup-rule-amendments/{proposalId}
POST /ai/story-brains/{novelId}/setup-rule-amendments/{proposalId}/decision
GET  /ai/story-brains/{novelId}/world-setup/rules/{rootRuleId}
```

Proposed creation DTO (NOT accepted by the current server):

```json
{
  "contract_version": "setup-rule-amendment-v1",
  "fact_id": "UUID of the currently effective parent",
  "expected_brain_version": 12,
  "idempotency_key": "stable author operation key",
  "replacement_text": "new rule text",
  "reason": "author's correction reason, audit-only"
}
```

Server derives root_rule_id, source snapshot/hash, subject/key/type and lock state. Request never picks a fact by name/key, never supplies author/tenant authority and cannot move a rule to another subject/novel. Proposed decision DTO has contract_version, expected_brain_version, idempotency_key and accept/reject; immutable proposal already binds the expected parent. Response includes proposal ID/status, root/parent/effective fact IDs, Brain version, original/proposed/effective text and audit references. No private notes/constraints leak to providers or public DTOs.

### Transactions and linear history

- Authenticate current active owner at Gateway and again under repository owner lock, including replay; tenant/novel/actor scope every lookup, not just endpoint context-preview. No ADMIN delegation to foreign private setup.
- Reuse consistent advisory admission → Brain → current Platform owner → parent/head → proposal/decision locking. Validate verified M0 and original approved setup provenance. Do not create or demote a Brain. Stable idempotency namespaces bind actor/tenant/novel/operation and full body hash; same key/body returns the same scoped receipt, conflicting body409, foreign404/403.
- Creation atomically writes **pending** proposal plus its operation receipt/audit, no fact/retirement/history/revision/outbox, no provider. Brain CAS is checked; whether pending creation/rejection increments an audit version must be frozen explicitly. Proposed default: authority Brain increments only on acceptance.
- Accept rechecks current Brain and effective parent under lock. Exactly one concurrent accept wins. Append a new confirmed FactRecord referencing parent via supersedes_id, carry the parent's lock, key/type/scope, no chapter/revision. Append decision/audit and bump Brain atomically. **Do not UPDATE the old accepted fact, even its content/lock.** Its loss of effectiveness is derived from the approved append-only supersession edge; original row/source/audit remains inspectable. Reject changes only proposal/audit, no authoritative rule. Transaction failure rolls back the entire acceptance.
- Effective-head resolver validates scoped approved lineage (not arbitrary columns): no cycles, forks, foreign references, orphan head or unapproved successor; exactly one effective rule per root. Apply it before locked-rule budget, state projection and provider context. Memory, Writing Context, readback and any projection/semantic consumers must agree. Do not just append `is_retired=false` to one query or resolve by equal text/key.
- Existing schema may be reusable under serialized Brain/head checks. A self-reference/unique-successor constraint may be considered only after legacy inventory; no automatic DDL/backfill in this PR.

### Lifecycle / historical context policy to approve

Original setup-v1 snapshot/review and M0 activation receipt remain immutable baseline evidence. Effective amended World Setup is a separate versioned view, not rewritten source. Active M0/M-FIRST stays active; no re-extraction or replay of old chapters/outbox. Existing queued Writing Brain CAS is reusable and must be regression-tested with new rule-head changes, including the final pre-provider and draft-accept windows.

Proposed scope: latest approved setup applies to new generation requests, even when editing an earlier chapter; existing immutable chapter revisions/events are unchanged. Historical prompt reconstruction uses the recorded generation context/rule-head/Brain version, not a forged chapter_number on a static setup fact. Recheck owner and context version at worker dispatch and stale-draft acceptance. Approval must settle whether current-context retcons versus chapter-effective rules are desired; do not infer this from narrative source chapter fields.

Pre-M0 correction remains unsupported in this first proposal: it needs a reviewed effective-setup/M0 consent contract, not a silent rebase of the old group audit. Post-M0 new rules/entities and subject-bound rules remain separate follow-ups with identity/provenance checks. No schema redesign is proposed.

## Gate before implementation

GPT-6 must approve the first lifecycle scope, append-only/lock policy, shared resolver, M0/root audit interpretation, effectivity/job-staleness semantics and idempotent audit storage. Then freeze DTO/error/readback contracts and add acceptance tests: pending/reject no authority; duplicate/conflicting key; concurrency/stale CAS; owner/tenant/novel transfer; rollback; exactly-one-rule in actual worker prompt; unchanged setup/history/first-save/outbox; 409/503 local edit recovery. Only then enable an explicit author proposal/approve UI. Current immutable source lock remains intact.
