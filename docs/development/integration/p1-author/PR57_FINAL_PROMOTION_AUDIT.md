# PR57 final bounded promotion audit

**Verdict: `PR57_READY_FOR_OWNER_AUTHORIZED_MERGE`.** No new merge-blocking runtime regression identified. This is an experimental feature-branch promotion recommendation; explicit owner authorization and the normal merge preflight remain required. PR57 stays Draft for GPT-6 review. No merge, deployment or production clearance is performed by this audit.

Audit time: `2026-10-24T14:17:37.453238+00:00`. Auditor: Codex, read-only source/evidence reconciliation. This audit reuses independently accepted execution; **zero new runtime tests, Docker operations, live AI/embedding calls or dependency upgrades**. No discrepancy required a targeted runtime test.

## Exact comparison and ancestry

- PR57 OPEN/Draft, mergeable, source `integration/p1-author@ccbd81d6b52c7839e18cb433c60a130a6acee5de`, target `feat/author-workspace@3100c46f46cd071467d762dff4ffa1fc4efe07f2`. Both expected heads confirmed after fetch.
- Target is the exact merge base/ancestor: source ahead102, behind0. A normal conflict-free merge onto the unchanged target preserves the audited source tree `b212272bc6521ae65787977dadfb9eca085d4ad3`. No squash, reset, rebase or ref update performed.
- PR67 merge `608bc3b76714985635471b1d875136d1aabaf04f` and PR65 merge `ccbd81d6b52c7839e18cb433c60a130a6acee5de` preserve the accepted evidence tree `b212272bc6521ae65787977dadfb9eca085d4ad3` exactly. `git diff d466daa6 ccbd81d6` is empty.
- Browser-tested source `c5a015aaef73eb4c5ed7c2b1673cc795567d0991` has tree `aaef0ae0d52cfd2c062fbe2d6c919b64cb1b0d28`; evidence commit `d466daa6243ccf111877dd56a8ee891dc3125459` adds only the acceptance evidence directory. Excluding that directory, tested source→current integration has **zero file delta**, including runtime, tests, configuration, dependencies and migrations. Different full trees reflect evidence files, not a different tested implementation.
- CI actually checks synthetic PR57 merge `f5b572db57313126f1f521cb9573fca1c626532d`, parents target+source. All10 job logs show that checkout; its tree equals current integration. SHA differences are not misreported as identical commits.

| Milestone | Normal merge commit | Verification |
|---|---|---|
| #63 | `dd2f8003b0ad94e6097819cdca0249aa591f54fa` | merged, ancestor of audited HEAD |
| #64 | `2eca7f19c20a71202d7c827af2e15d8fb6dc88bb` | merged, ancestor of audited HEAD |
| #66 | `6de87f575ee2e3d114ee83159c2b335667a62e7f` | merged, ancestor of audited HEAD |
| #67 | `608bc3b76714985635471b1d875136d1aabaf04f` | merged, ancestor of audited HEAD |
| #65 | `ccbd81d6b52c7839e18cb433c60a130a6acee5de` | merged, ancestor of audited HEAD |

## Complete delta inventory

Local `git diff --name-status --no-renames 3100c46f46cd071467d762dff4ffa1fc4efe07f2 ccbd81d6b52c7839e18cb433c60a130a6acee5de` enumerated **1518 paths, zero deletions**. This is the full inventory, not GitHub's truncated300-file response. [Complete TSV](PR57_FINAL_PROMOTION_INVENTORY.tsv) records status/category/path for every entry; [machine checks](PR57_FINAL_PROMOTION_CHECKS.json) record exact Git commands/exits, CI and evidence comparisons. Categories partition the complete set; runtime/support includes fixture helpers/config and is not a claim that every path is executable production code.

| Category | Paths |
|---|---|
| tooling/CI/compose | 26 |
| AI runtime/migrations | 32 |
| tests | 44 |
| Node runtime/support | 17 |
| docs/evidence/history | 1379 |
| web runtime/config | 20 |

No historical backend SQL migration differs from target. AI migrations0010–0013 are additions; existing AI migration files are unchanged. The delta is selectively integrated P1 code and historical documentation/evidence, with retained P2/P3 compatibility fences.

## G0 architecture/contract matrix

Paths below are relative to the audited Git tree. PASS combines direct implementation inspection with exact applicable test/evidence, not an agent assertion.

| Area | Status | Source and supporting checks |
|---|---|---|
| Ordered writer and Mongo CAS | PASS | `backend/src/modules/novels/chapter-writer.ts`: dedicated PG advisory admission lease, conflicting concurrent writer409, valid nested lease reuse. `chapters.service.ts:updateChapterUnderLease`: required version428, stale semantic change409, idempotent unchanged replay, Mongo CAS before metadata/revision writes. `draft-chapters.repository.ts` conditional sync preserves newer author draft. Existing persistence/fixture regression logs and G2 durable snapshots apply unchanged. This does not promise global FIFO scheduling or a distributed PG/Mongo transaction. |
| Debounce/Undo/in-flight save | PASS | Existing `web/src/features/author-ide/useDraftPersistence.ts` is byte-identical to target; 1200ms pending replacement/ABA no-write, running-drain serialization and409 recovery. `AuthorWritingIde.tsx` still mounts it with user+chapter identity and validates context. Actual mounted G2 six stages verify server state, not only a saved label. |
| Immutable revision/outbox/provenance | PASS | `chapter-revisions.service.ts:createSnapshotUnderLease/snapshotSavedChapter`: active-baseline gate; immutable revision/hash/parent and outbox in one SQL transaction; pre-baseline draft-only. `jobs/outbox-processor.ts` dispatches extraction and leaves proposals pending; no generic-worker Canon acceptance. `chapter-revisions` and outbox source plus changed-save snapshot assertions and PG persistence tests substantiate this. |
| Approved-only memory | PASS | `ai-service/api/entity_hitl_routes.py`: confirmed current facts, active/nonretired events, filtered transitions, UUID projection, accepted-proposal provenance. `postgres_narrative_repository.py` materializes Canon on authorized accept. Pending correction/review remains separate across reload; source/newer state is never synthesized as historical transitions. |
| Identity review/freeze | PASS | `application/entity_hitl.py`, `entity_review_service.py`, `reviewed_inventory.py`, `services/entity_pipeline/verification.py`: immutable occurrence IDs, tenant/novel/revision/hash/checkpoint provisional scope, human decisions, CAS, stable reserved UUIDs at freeze, compatible refresh carry-forward. H01–H05 PG suites and actual same-name Minh UI workflow/readbacks apply. No authoritative name-matching fallback for ambiguous identity in this reviewed flow. |
| Atomic edited approval/CAS | PASS | `postgres_narrative_repository.py:accept_proposal_group` locks Brain then members, validates exact persisted scoped membership/status/version/edits/frozen identities, materializes and validates projection, increments Brain once within the same session transaction. Duplicate/mixed/incomplete/stale requests fail closed. Single acceptance delegates to this invariant. `tests/test_c01_canon_group.py`, `test_p1_contract_alignment.py`, full PG187 and stored before/after partial-accept/invalid-edit negatives apply. |
| Atomic rejection | PASS | `_reject_dependency_group` uses Brain→group locks, all pending members, per-member audit decisions, no Brain increment/Canon write; single reject requires genuine singleton. `test_atomic_group_rejection.py` covers rejection/accept races, persistence rollback and scope. Saved real UI rejection changes only proposals and proposal_decisions, adds2 decisions, preserves every other scoped table/Mongo value. |
| Corrections and exact-ID locks | PASS | `narrative_service.py:propose_event_correction`, `domain/projection.py:project_relations`, `_persist_projection/lock_relationship`: explicit author correction with immutable evidence; exact subject/target UUID pair, legacy names resolved only if unique, ambiguous legacy locks fail closed. Existing H05 rollback/rebuild tests and two homonymous-subject UI locks/reload apply. |
| Authorization/tenant | PASS within inherited role policy | Gateway `ai-gateway.routes.ts` requires authenticated active AUTHOR/ADMIN; controller resolves proposal/group novel server-side and checks ownership before forwarding. Python requires service credential; entity HITL validates tenant headers; repository scopes novel+tenant rows. Full saved401/403/409/422 negatives remain unchanged. **ADMIN ownership exemption already exists on target**; this audit does not certify a stricter no-ADMIN policy. Human approval authority excludes generic extraction workers. |
| Browser API boundary | PASS | `web/src/shared/api/api-client.ts`: trusted build-time Vite base, no browser-controlled destination override, existing auth/cookie handling. FE15 actual two-origin adversarial tests and postmerge P8 frontend boundary/security checks apply. No browser→Python bypass introduced. |
| Consistency immutable-source contract | PASS, compatibility constraint | `narrative_routes.py:author_operation` validates real Core chapter/revision/hash/exact content before read-only UUID/current-state comparison, with403/404/422 invalid-source handling. The production AuthorMemoryPanel sends all fields. Repository-wide caller search finds the bootstrap check_consistency boolean as a separate revision-analysis option, not an outdated call to this public operation. Proxy-only test stubs are not valid business-contract examples. Other downstream clients must adopt the saved-revision contract. |
| Feature defaults and P2/P3 fences | PASS for source/CI compatibility | `core/settings.py` defaults candidate verification OFF; acceptance stack enables it explicitly. `controller-intent.ts` checks scoped run/plan/objective/intent epoch under SQL locks; `chapter-revisions.service.ts` invokes the guard before accept. Controller idempotency includes objective+intent+plan;0013 persists monotone intent. Existing controller/intent, P2 bootstrap/plan, P7/P8 smoke regressions apply. Full P2/P3 product execution is NOT_RUN by this promotion audit. |
| Migrations | PASS | Both SQL012 files plus013–017 remain byte-identical to target. Recorded SQL ledger includes both012 and017; public.alembic_version=`0013_objective_intent`, whose parent is0012_entity_guidance. Four new AI migrations have upgrade/downgrade; no historical migration rewrite. Fresh combined migration/replay and postmerge rollback/cutover jobs are green. |
| Legacy/name-keyed consumers | PARTIAL, bounded compatibility | Legacy `export_snapshot/get_related_entities` adapters remain present. Current AuthorMemoryPanel uses typed approved-memory UUID APIs. No blanket certification that every legacy or external consumer supports homonyms; no refactor or expanded product claim. |

## G5 evidence validation and applicability

[Independent G5 acceptance](https://github.com/Ephurin/Novel_sharing_platform/pull/67#issuecomment-6384788368) and [final integration checkpoint](https://github.com/Ephurin/Novel_sharing_platform/pull/57#issuecomment-6385045600) were read in full. Historical [FINAL_HANDOFF](final-fe-acceptance/evidence/FINAL_HANDOFF.md), [SOURCE_MATRIX](final-fe-acceptance/evidence/SOURCE_MATRIX.md), [S09–S11 stages](final-fe-acceptance/evidence/S09_S11_MATRIX.md), [provenance](final-fe-acceptance/evidence/EVIDENCE_PROVENANCE.md) remain unmodified and describe their own earlier checkpoint; this audit appends the current status.

Direct inspection in this audit established:

- All173 manifest entries verified: **43 exact canonical Git blob hashes, 130 Windows CRLF export hashes reproducible from LF-normalized committed text**. The original manifest records Windows export bytes; direct raw-blob equality alone is not valid for normalized text. The new checks file records canonical SHA256 and original hash/mode for every entry. Binary artifact bytes match exactly. No historical manifest was rewritten; this formatting discrepancy is resolved as metadata, not treated as runtime corruption.
- All28 mandatory named production-SPA stages PASS; zero runtime-error entries. Test/harness source uses built SPA, fixed same-origin proxy, actual Gateway/Python/fresh owned PG/Mongo. Response-delay routes use real route.fetch()/fulfill(response), not fabricated API success. Fixtures are separate from UI review/approval.
- **13 complete saved negative before/after data pairs are exactly equal**, including401 anonymous,403 foreign/Reader,409 review/Canon/stale-continue,422 unknown identity/forged authority, incomplete single accept/reject and required-version negative group. No scoped data field was removed for equality. These are archived execution readbacks; no database was contacted now.
- Real group rejection changes only proposals/decisions and adds exactly2 decision rows. Canon/Brain version and all other scoped PG/Mongo state remain identical. Atomic approval additionally follows the repository transaction inspected above and existing complete-group/C01 PG tests; approved UUID/provenance/state survive reload.
- Actual network evidence:528 requests,437 SPA. Fake ledger delta17 on isolated internal networks, runtime embeddings disabled, fake embedding/pgvector tests separate. No real-provider acceptance claim;17 fake requests are not live model usage.
- Commands/exits distinguish final clean source, expected RED, setup faults and dirty attempts. Redaction, ZIP-member scan, runtime/source equality and owned cleanup are documented. No JWT/private env is added by this audit. Binary payloads are hash-checked; **no new screenshot visual review or trace replay** is claimed.

## Exact final integration CI

[P7 run40099358646](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40099358646): **3/3 SUCCESS**. [P8 run40099358658](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40099358658): **7/7 SUCCESS**. REST head SHA is `ccbd81d6b52c7839e18cb433c60a130a6acee5de`; all10 checkout log SHAs and synthetic-tree identity were independently checked, including rollback/cleanup/cutover jobs.

| Workflow | Job | Job ID | Conclusion |
|---|---|---|---|
| P7 | root-compose-smoke | `120888123513` | SUCCESS |
| P7 | pgvector-integration | `120888123682` | SUCCESS |
| P7 | unit | `120888123733` | SUCCESS |
| P8 | frontend-api-cutover | `120888123664` | SUCCESS |
| P8 | backend-integration | `120888123812` | SUCCESS |
| P8 | unit | `120888123817` | SUCCESS |
| P8 | postgres-integration | `120888123821` | SUCCESS |
| P8 | final-cleanup-gate | `120888123832` | SUCCESS |
| P8 | rollback-rehearsal | `120888123838` | SUCCESS |
| P8 | root-compose-cutover-smoke | `120888123932` | SUCCESS |

## Current G0–G5 disposition

| Gate | Status | Basis |
|---|---|---|
| G0 | PASS | Full uncapped1518-path reconciliation, ancestry, merge/source equality, source matrix above. |
| G1 | PASS (existing evidence reused) | Combined migration/replay ledger, persistence/security/CAS regressions and final integration CI. |
| G2 | PASS (existing evidence reused) | Actual S09 Undo/serialization409/navigation/account scope and immutable revision/outbox readbacks; runtime source identical. |
| G3 | PASS (existing evidence reused) | Actual human identity workflow, atomic Canon/correction/locks and reload/resume, source and durable negatives verified. |
| G4 | PASS for bounded smoke | Author/Reader/Admin, auth, theme/mobile, VIP denial, local media, comments/reviews/wallet/notifications pages, moderation queue and schedule form. Execution of finance/publication/moderation resolution remains NOT_RUN. |
| G5 | PASS for existing bounded P1 source/evidence | Independent review accepted FE15–FE19; this audit verifies final integration provenance and promotion scope. **New documentation delta still requires GPT-6 review.** |

## Deferred functionality and release risks

1. **Experimental promotion only.** Live Gemini/embedding quality or quota use, production/cloud authentication, scale/load/100k runs, real payment/deposit/withdrawal, VIP purchase, publication/scheduler execution and moderation resolution are NOT_RUN here. No P2/P3 implementation or new acceptance is implied by existing CI smoke.
2. **Dependencies:** committed audit records baseline10 advisories (8 high/2 moderate) and3 additional moderate package advisories from build-only selector-parser GHSA-rj75-hqrm-r3gf. Independent G5 explicitly accepts this for trusted-repository-CSS experimental promotion, not production/dependency release. Track/remediate before production; no dependency scan/update repeated here.
3. **Unicode edits:** supported casefold alphabet is bounded; unsupported script/name edits fail closed. No universal Unicode parity. Legacy/name-keyed/external consumers remain outside broad homonym compatibility clearance.
4. **API contract:** consistency requires saved immutable chapter/revision/hash/content; external callers with mock revision IDs must migrate. Typed UI and accepted real-stack path comply. Preserve inherited ADMIN policy; stricter role-policy changes require separate design/review.
5. **Provenance limits:** historical binary trace/screenshots were text-reviewed by G5; this audit verifies canonical bytes, without visual replay. Windows export hashes require the documented CRLF reconstruction. Historical reports are checkpoints, not current unqualified production statuses.

## Owner action and stopping rule

Recommend `PR57_READY_FOR_OWNER_AUTHORIZED_MERGE` at the exact source/target above; no concrete new merge-blocking regression remains. This docs-only child targets integration and preserves reviewed history. Review/land the documentation through normal owner controls, then **re-fetch/re-lease actual heads** before any PR57 action. If documentation landing advances integration, establish the docs-only delta and verify CI for that final candidate; any runtime or target change requires a fresh delta assessment.

PR57 remains Draft; this audit does not mark it ready or merge it. After explicit owner authorization, the allowed promotion is a **normal merge** integration/p1-author→feat/author-workspace, followed by lightweight postmerge P7/P8 verification. Main, deployments and other PRs are out of scope. P7/P8 path filters may skip this docs-only child; do not widen workflows or rerun full E2E to manufacture an extra green. The final integration CI above is the actual runtime evidence, not an assertion that it ran on the documentation commit.
