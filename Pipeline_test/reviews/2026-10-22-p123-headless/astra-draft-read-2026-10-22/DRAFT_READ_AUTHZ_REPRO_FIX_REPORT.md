# ASTRA private draft read authorization handoff

2026-10-22 Asia/Saigon. `HOLD_FE_INTEGRATION_ONLY`. Local security HTTP GREEN; stop for GPT-6 independent delta review. No Core integration PASS or merge authorization.

## Source and root cause

Baseline `7191016fcf67150b332a1d64551d105d2c91d75e`, final clean tested source `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`. Production fix committed first at `f2e04287`; harness-only follow-ups `9cd8787c`, `d7d9651a` precede final validation. Evidence is a separate later commit. Existing dirty original checkout preserved through an isolated detached worktree; only assigned remote branch receives commits.

`chapters.routes.ts` omitted authentication; controller passed only chapter ID; `getChapter` read Mongo editor draft without account/owner checks. Also confirmed public list returned unpublished metadata and bypassed VIP body gating.

Four production files changed: `chapters.routes.ts` and `novels.routes.ts` require AUTHOR/ADMIN authentication for private GET/list; `chapters.controller.ts` forwards trusted request auth; `chapters.service.ts` checks live active account/current role, loads actual chapter parent and applies existing owner/admin policy before accessing draft/list. No changes to writer lease, Mongo CAS, revision/outbox, P3, migrations, AI service or web. No new public route needed because /reading/* already enforces publication and entitlement.

## Actual HTTP RED → GREEN

Fresh RED on baseline-equivalent production source: anonymous/foreign AUTHOR GET 200 with private Mongo marker. Public list also disclosed DRAFT title/id/status and later locked VIP canonical body. New RED harness was untracked at that time; see provenance rather than claiming clean committed RED harness. Historical read-authz-red is untouched.

Final GREEN on exact clean `d7d9651a6dc17a1986b8b03e5d3ffa07a0a9093a`: anonymous 401; foreign AUTHOR 403; owner AUTHOR 200 with unchanged content/version; unknown chapter 404; ADMIN 200 except deleted parent 404; reader/wrong-role 403; invalid token 401; forged query owner/novel cannot bypass. Same privacy for DRAFT/REJECTED/PENDING_MODERATION/PUBLISHED/ARCHIVED. Account LOCKED/DELETED 403; soft deletion 401. Direct-service and controller-negative tests included.

Whole PG public-table and Mongo collection hashes before/after private read matrix and each status match, including users, ownership, revisions/outbox and draft documents. VIP denied reads also hash-check unchanged state. No workers started; fake upstream receives zero calls; provider keys empty. Fixtures created through registration/login and author novel/chapter HTTP. Role promotion, status transitions, canonical published test content and synthetic coin funding are explicit test DB fixture operations, not product publishing/payment flows.

Public free reading returns canonical content only; API-unlocked reader gets VIP canonical content, never editor draft; anonymous and other author remain 402. Legacy novel metadata remains public, documented separately as unresolved product policy, not silently declared private-safe.

## Validation and failures

Final source: typecheck exit 0; build exit 0; 54/54 focused tests exit 0 (private auth boundary, job-resume auth, chapter revision patching, controller intent guard, outbox unit and PG production persistence/idempotency).

An additional existing `mongo-reconciliation.live.test.ts` failed 3/3, exit 1: its `live-test-chap-*` IDs are not UUIDs and now reach a PG UUID query. The same 3/3 failures reproduce from exact baseline backend archive `7191016f`. Preserved both logs; did not modify unrelated writer code or disguise this as full backend PASS. Initial provisioning raced PG readiness: migration failed, then first RED lacked users table; migration retry and RED succeeded. Logs and command exits preserve these limitations.

Final HTTP run reuses only this task's fresh isolated GREEN database and creates new unique identities/novel/chapter; earlier synthetic fixtures remain. RED and first GREEN had separate newly-created containers. All six task containers were stopped with label/ID verification, data retained, no old containers/volumes deleted. See resource-lifecycle.json.

## Reproduction

Use an empty task-owned PostgreSQL pgvector:pg16 and Mongo mongo:7, loopback ports, approved ephurin_test_* DB names, EPHURIN_ALLOW_TEST_DB_MUTATIONS=1 and EXPECTED_TEST_DB_NAME. Set DATABASE_URL/MONGODB_URI and synthetic JWT secrets locally; clear all provider keys; AI URLs loopback. Install locked backend dependencies. Run `npm run db:migrate`, then `AUTHZ_EVIDENCE_DIR=<outside-source-dir> node --import tsx src/scripts/verify-draft-read-authz.ts` from backend. Never set AUTHZ_EXPECT_RED on fixed source except to deliberately test a failing expectation. Exact focused commands and exits are in commands-and-exits.json. Source must be committed and git status empty before collecting GREEN. Harness output redacts all authentication tokens/cookies/passwords.

## Boundary

No real provider, provider quality, full backend acceptance, full P1/P2/P3 rerun, FE/S09 integration, populated migrations, PR #52/#54/#55 merge, main write, publishing or 100k acceptance. No independent GPT-6 runtime/review claim. Remaining preexisting Mongo test defect and novel metadata policy are explicit follow-up findings. Request independent delta review of the narrow source and evidence; do not proceed to integration or merge.
