# P2-04 runtime evidence

Implementation source `c5b54448f5ed8ed1d361082e7441359945dfc201`, base `e7c7e078306408b28094334d89e32f1ba09e5c8f`. Feature CI checkout `03af548ef14c29951facb37f7f966f41788f94b8`; source/checkout tree both `fe36c157ba760f3c85cfa382742b89d968e23c76`. All job links/conclusions are in `source-ci.json`.

- [P2 Feature42488597839](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42488597839):1/1 job PASS;139 SQL PASS including26 M0 cases,46 focused PASS,19 Gateway forwarding PASS, separate real P1 save and setup/plan Gateway tests PASS, new real M0→Writer/HITL Gateway test PASS,8 Chromium mounted UI tests PASS (HTTP mocked).
- [P742488597903](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42488597903):3/3 PASS; non-PG415 PASS/32 SKIP/345 deselected plus6 subtests. PG/vector/P1 HITL and root Compose checks PASS.
- [P842488597758](https://github.com/Ephurin/Novel_sharing_platform/actions/runs/42488597758):7/7 PASS; full PG337 PASS/8 SKIP/447 deselected. Root P1 generate/accept/bootstrap/outline/controller, Core persistence, rollback, web/backend/mobile checks PASS.
- Each test command/verification above exited0. Counts from overlapping jobs or different source SHAs are not added together.

## Immutable archives

| File | Artifact | SHA256 |
| --- | --- | --- |
| source-c5b54448.zip |13620741657|5334b58c492c413e27fa7201b888b58701f27e40ba70f19ad4000bf6298530af|
| rollback-c5b54448.zip |13620157982|7a578115f77a2b22a454e6bad87430394f2d0e679cf8501077fd30373c4d4fe2|

Feature databases are real disposable `p2a`, PostgreSQL16.15/pgvector and Mongo7.0.45. All model providers are fake/offline, with no paid secrets or live forwarding. The new live Gateway/Writer test uses a separately restarted task AI process with the existing P1 entity-HITL flag enabled; original feature regressions retain their earlier mode. Raw synthetic setup notes in SQL/HTTP-request evidence are intentional fixture proof, distinct from operational logs; all four operational logs are scanned and exclude private markers/fields.

`m0-writer-readbacks.json` contains25 full, hashed durable snapshots across two novels. Both reviewed/activated M0 snapshots have no plan, revisions, outbox, Mongo draft, events, mentions or transitions; accepted entities/rules already existed before activation. Exact replay is unchanged. Example first novel M0 digest `e865c292fd2f1ad2084b103d54b7c73185fb16d68d600356ab25bd42a467d162`; second `2466410222ed24cb935e5be7494b65f95a1af998fe3a40f264478f85504afaec`.

First genuine PATCH yields one AUTHOR_MANUAL revision, one completed dispatch item, and a waiting P1 entity checkpoint, with0 historical events. After author entity review/continue, proposals remain pending; only existing author group-HITL approval creates the first confirmed event. Its raw evidence quotes the actual immutable chapter1 source span/hash/IDs. A real active Plan for chapter8 contains FutureOnlyBetrayal; no confirmed event contains it. Optional0/5/20 objective M0 cases are separately exercised by26-case PostgreSQL suite, not mislabeled as live-provider/browser acceptance.

The second novel's meaningful create/retry produces one revision/outbox and Mongo version1. Actual fake-provider generations use that genuine base revision; accept creates AI_DRAFT_ACCEPT with correct parent, exact P1 acceptance replay returns the same receipt, and a different stale generation conflicts409. Partial/no M0 provenance blocks automatic history; restoring valid provenance and retrying creation snapshots current edited draft text. SQL/outbox insertion failure rolls back revision/outbox but permits Mongo-based reconciliation. A scoped real Mongo collection validator induces initial-draft failure after SQL chapter creation; restoring the original validator and retrying the same client key reconciles that chapter, with no duplicate row or fake revision. Final total:7 genuine immutable revisions across two novels; every unique revision remains immutable across readbacks and hashes its actual content.

No new migration. Rollback preserves migration0017 and pgvector0.8.7; normalized source/restore schema+data digest `4130a16cdc0c457e47328bfcf42cc13e967240c793873b1853c7b723d3f281ef`, raw source unchanged `8955a996978141019e33e5b75d4705fa7e4ff80d4789a06c2e3c7825e829d028`. This existing rollback fixture is schema/cutover evidence, not a claim that a separate live M0 run was restored.

## Offline verification

```text
python docs/development/p2/p2-04-evidence/verify.py docs/development/p2/p2-04-evidence/source-c5b54448.zip
```

Exit0 verifies every durable snapshot hash, zero-history M0/unchanged activation replay, actual source content hashes, immutable revisions, pending entity/Canon gates, confirmed event source spans, future-plan separation, CAS/failure/reconciliation outcomes,26 passing M0 SQL cases, four private-log scans, rollback file checksums/parity and migration/vector state. `m0-ui.png` in the feature archive is a mounted mocked-HTTP screenshot, visually inspected; full browser→database E2E and live-provider quality remain NOT_RUN by scope. Exact delivery-head CI is reported separately in PR100 metadata after the documentation/evidence commit.

Historical failing CI and invalid local environment/typecheck attempts are explicitly retained in `P2_04_M0_FIRST_CHAPTER_HANDOFF.md`; no evidence from older P2 tasks is rewritten.
