# PR54 main-promotion audit — RC-01

Date: 2026-10-24T16:13:13.001854+00:00. Instructions: [GPT-6 bounded gate](https://github.com/Ephurin/Novel_sharing_platform/pull/54#issuecomment-6386069671).

**MAIN_BRANCH_MERGE_READY: recommended for GPT-6 review and subsequent owner-authorized code integration. PRODUCTION_READY: NO.** No new source blocker was identified within this bounded audit. No merge, readiness-state change, deployment, provider call or main ref mutation was performed. This is not product-wide functional/security clearance.

## Exact candidate and source provenance

- PR54 OPEN, not Draft, mergeable; `feat/author-workspace@368e1294c58401e62198d24f91086f3280438ca4` → `main@390b09fd043ec29db84519a9d195b59b76eec003`. Both remote refs were fetched and reconfirmed. Main is the merge base/ancestor; ahead119/behind0.
- Source tree `2c0565f8757da142b9d8d129f922177d47eda9d2` equals pre-PR57-merge `33972098` exactly. PR55 accepted source `7b15c07` and merge `3100c46`, PR57 merge `368e1294`, and accepted P1 source/evidence are ancestors.
- Full local `git diff --name-status --no-renames main source`: **1649 paths**. [Inventory](PR54_MAIN_PROMOTION_INVENTORY.tsv) is uncapped; it replaces neither history nor the different 1518-path PR57 comparison. [Machine checks](PR54_MAIN_PROMOTION_CHECKS.json) contain commands/exits, overlap and CI metadata.
- Runtime, tests, dependencies, migrations and configuration are byte-identical to browser-tested `c5a015aaef73eb4c5ed7c2b1673cc795567d0991` when excluding documentation. The entire archived acceptance directory is unchanged from evidence `d466daa6243ccf111877dd56a8ee891dc3125459`. Full Git trees differ because evidence/audit documents were added.

| Complete-diff category | Paths |
|---|---:|
| AI runtime/config/migrations | 32 |
| Node runtime/config/migrations | 70 |
| documentation/evidence/pipeline tooling | 1401 |
| frontend runtime/config | 72 |
| root/CI/other configuration | 17 |
| tests/fixtures | 57 |

## CI: final source and actual checkout

| Workflow | Individual conclusions | Run |
|---|---|---|
| P7 | unit, pgvector-integration, root-compose-smoke: **3/3 SUCCESS** | [40107226736](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40107226736) |
| P8 | frontend-api-cutover, backend-integration, final-cleanup-gate, unit, root-compose-cutover-smoke, rollback-rehearsal, postgres-integration: **7/7 SUCCESS** | [40107226724](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40107226724) |
| Defense Demo Contract | validate-defense-demo: **1/1 SUCCESS** | [40107226743](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/40107226743) |

All workflow job records identify source `368e1294`. All10 P7/P8 checkout logs actually use synthetic PR54 merge `0a91952679e969a795faae3d4c68ce7daa3f4bfa`; its parents are current main+source and its tree is exactly `2c0565f8757da142b9d8d129f922177d47eda9d2`. Different commit SHAs are not equated. These are existing exact-source runs, not runs on this new documentation commit.

## Bounded contract reconciliation

| Area | Result and direct source/evidence |
|---|---|
| Persistence / revision / outbox | PASS in accepted P1 scope. `backend/src/modules/novels/chapter-writer.ts`, `chapters.service.ts`, `chapter-revisions.service.ts`, `web/src/features/author-ide/useDraftPersistence.ts`: admission lease, Mongo CAS, debounce/ABA, serialized in-flight saves, stale409 recovery, immutable revisions/outbox, context isolation. No runtime delta from tested source. See [G0 source matrix](PR57_FINAL_PROMOTION_AUDIT.md) and [S09–S11 stages](final-fe-acceptance/evidence/S09_S11_MATRIX.md). No distributed PG/Mongo atomicity or global FIFO guarantee is added. |
| Canon / identity / HITL | PASS in accepted P1 scope. `ai-service/infrastructure/postgres_narrative_repository.py`, `application/narrative_service.py`, `domain/projection.py`: approved-only memory; human review/freeze; provisional groups and exact UUIDs; C-01 complete-group approval and atomic rejection; B5 exact edited payloads; CAS; correction provenance and exact-ID locks. Existing H01–H05/B/C regressions apply unchanged. Pending proposals remain outside Canon. |
| Owner/tenant and browser API | PASS in tested boundaries. `backend/src/modules/ai/ai-gateway.routes.ts`, `ai-gateway.controller.ts`, `web/src/shared/api/api-client.ts`: active author/ownership and trusted configured API destination. No browser localStorage/window override remains. Immutable consistency request supplies chapter/revision/hash/content. Inherited ADMIN exception is documented in prior audit; no stricter no-ADMIN policy is certified. Candidate verification remains **False by default** in `ai-service/core/settings.py` (including environment fallback). P2/P3 rollout is separate. |
| Old rating review | RESOLVED IN SOURCE/EVIDENCE. `NovelReviews.tsx` labels the average explicitly as text-bearing reviews; repository/API docs distinguish statistics over all scores from text-review-only average. `web/tests/draft-persistence.browser.test.mjs` asserts one text review, review progress10, statistics average7 with a score-only rating. Archived `logs/web-mounted-attempt4.log` reports16 PASS/0 FAIL, including this source-equal mounted suite. The original [thread](https://github.com/Ephurin/Novel_sharing_platform/pull/54#discussion_r4344605897) can be acknowledged without rerunning broad E2E. |
| Migrations | PASS for source continuity and existing isolated CI, PARTIAL for production operations. Both distinct SQL012 files remain; SQL013–017 and AI0010–0013 are additions against main, no pre-existing migration is modified. Node `migrate.ts` uses the **full filename** as ledger ID and one transaction per file, so shared numeric012 is not an ID collision. AI head remains0013_objective_intent. P8 rollback rehearsal SUCCESS is isolated evidence, not a production backup/restore or populated-production upgrade rehearsal. |
| Launch/deployment | PARTIAL. Main→source root Compose adds persistent `media_data:/app/backend/uploads`; no Dockerfile/entrypoint delta. Inherited entrypoint defaults run migrations and demo seed: deployment owner must explicitly disable demo seeding, control migrations and review secrets/service/model endpoints. Media backup/permissions/restore and external CD/webhooks are NOT_RUN. Repo main-triggered Defense Demo validation is static; eval workflow uses offline/dry-run diagnostics. This audit cannot certify external deployment integrations. |

## Reuse and limits of acceptance

Applicable records: [FINAL_HANDOFF](final-fe-acceptance/evidence/FINAL_HANDOFF.md), [SOURCE_MATRIX](final-fe-acceptance/evidence/SOURCE_MATRIX.md), [S09_S11_MATRIX](final-fe-acceptance/evidence/S09_S11_MATRIX.md), [EVIDENCE_PROVENANCE](final-fe-acceptance/evidence/EVIDENCE_PROVENANCE.md), and [accepted G5 review](https://github.com/Ephurin/Novel_sharing_platform/pull/67#issuecomment-6384788368). Prior [G0/G5 audit](PR57_FINAL_PROMOTION_AUDIT.md) verified173 manifest entries (43 canonical blobs,130 documented Windows-CRLF reconstructions) and13 identical negative before/after readbacks. That proof is reused because the archived evidence and runtime source are unchanged; it is not newly executed evidence.

Existing production-SPA acceptance is **one scenario with28 mandatory PASS stages**, not28 independent Node tests. It exercised SPA→Gateway→Python→isolated PG/Mongo, approved/pending separation, immutable provenance, atomic commit/reject, negative401/403/409/422 and durable state, bounded G4 reader/admin/theme/mobile. AI unit353 PASS/10 SQL-only SKIP; PG187 PASS; FE41 PASS; mounted/security16 PASS; backend133 PASS/3 SKIP plus accept-draft14/persistence5/fixture25. Counts are separate suites, not summed CI retries. Fake text request delta17; runtime embeddings disabled (fake embeddings separately exercised in unit/PG suites); no real-cloud calls claimed. See archived commands/readbacks for exact scope.

No newly discovered contract discrepancy required a targeted runtime test. **This audit ran zero runtime tests or Docker operations**, and did not repeat28-stage E2E. Finance/VIP purchase, publication/scheduler execution, moderation resolution, live-model/embedding quality and production operations remain NOT_RUN; read-only/locked-screen smoke does not establish those workflows.

## Owner decision matrix

| Decision / risk | Required owner action before applicable promotion |
|---|---|
| Main code promotion | GPT-6 independent review, then explicit repository-owner authorization; refresh both heads/checks and normal merge only. Confirm external main automation will not cause an unauthorized deployment. Any new runtime delta requires targeted evidence; documentation-only delta needs its own provenance review. |
| PR52 overlap | FE owner keeps PR52 separate. PR52 has18 changed paths, **14 overlap** with this main delta (enumerated with blob comparisons in checks JSON). No automatic additional merge/cherry-pick; reconcile desired theme intent against accepted workspace before any future PR52 action. |
| Security dependencies | Security/release owner must disposition recorded baseline8 high/2 moderate advisories and3 moderate package advisories associated with build-only selector-parser GHSA-rj75-hqrm-r3gf. Trusted CSS build exposure is bounded, not a clean security audit. No unrelated dependency upgrade or new registry audit was performed here. |
| Database / media operations | Schema/deployment owner approves populated-data upgrade, rollback/backup rehearsal, media volume retention/restore and migration scheduling; sets demo seeding OFF and reviews real secrets/service destinations. Isolated CI does not satisfy this gate. |
| Business release | Product owners execute/approve finance/VIP purchase, publishing/scheduler and moderation-resolution gates before claiming those capabilities release-ready. |
| Live AI / embeddings | AI owner separately authorizes budget, secrets and quality tests. Approved future live primary Gemini3.5 Flash Lite; only explicit3.1 Flash Lite fallback; no2.5. Current audit is offline and spends no quota. Base/demo configurations are not certified production launch configuration. |
| Unicode / legacy consumers | API/FE owners retain bounded Python/JS casefold support and fail-closed unsupported edits. No universal Unicode equivalence or blanket safety for name-keyed legacy consumers. Preserve exact-ID P1 paths. |
| Rollout | Release owner keeps P2/P3 autonomous rollout separate. Main merge approval is not deployment, product-wide acceptance or production readiness. |

Limited remediation: independent review of this documentation, acknowledgment of the old rating thread and correction of PR54's obsolete description. Production-risk remediation requires separate owner-scoped tasks. No implementation, migration rewrite, branch-protection bypass, PR52 merge, live provider or production operation is authorized by this report.

**Stop for GPT-6 independent review. PR54 remains unmerged; main is unchanged.**
