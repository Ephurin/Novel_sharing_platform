# GPT-6 handoff — PR60 smoke contract

**PR60_SMOKE_CONTRACT_READY_FOR_GPT6_REVIEW** (bounded smoke repair, not complete P1/CI acceptance).

Initial SHA043b21e2d37dd0c3a5429250804d9b0bbc8c9dab; final clean tested source `fbbed59de869bbcd9fcd816c9635aaecbdb0e521`. Source committed before sealed validation; evidence commit follows. PR60 remains Draft; no merge.

Reproduced remote CI run39912466481 checkpoint11 locally: outbox COMPLETED and brain2→2 caused exit1. Repaired02A and related01A/02B expectations to require pending proposals and unchanged canon before explicit authorized Gateway review; approved canon then changes2→3 exactly once. Stale review/replay409 leave durable projections and version unchanged. Immutable revision/hash/latest/owner/version fences are retained.

Sealed root-compose command:

```text
python scripts/run_pr60_root_smoke.py --output <NEW_OUTPUT_DIRECTORY> --allow-new-test-resources --scripts 01a 02a 02b 03a
```

At tested source: 62 checkpoint PASS/0 FAIL/0 SKIP (15+13+16+18), 10 native test executions PASS/0 FAIL/0 SKIP (5 unique cases twice), all4 evidence verifier processes exit0,02A12 negative mutants rejected, Python compile0. Exact commands/exits in sealed/commands.json and VALIDATION.json. Real fresh PG/Mongo; fake provider and fake embedding only; all created containers stopped, volumes retained. Durable canonical readbacks and source/proposal/group/outbox IDs are in DURABLE_READBACKS.json and sealed/*-evidence.json.

Separate CI concern: old frontend-api-cutover job120278354796 failed from14 cancelled accept-draft-contract tests (122 pass,0 fail,3 skip). PR58 `gemini/p1-ci-isolation` remains open/unmerged at66ee899deb8da71f0b6a8c2a0c4fbeca44448a30. CI_FAILURES.json links/excerpts distinguish this from the root smoke regression. No Gemini isolation/CI files modified and no need to wait for that PR to review this fix. New-head full GitHub CI is not certified by local smoke.

Other PR60 full HITL/entity-review route and PR59 combined persistence blockers remain as previously disclosed. No production Canon worker edits, full editor, live-provider calls, deployment, main/integration writes, PR58 changes or self-approval. Stop for independent review.
