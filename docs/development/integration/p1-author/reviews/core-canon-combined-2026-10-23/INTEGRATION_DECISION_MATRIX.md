# Selective integration decisions — before implementation

Base fetched4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5. PR59 fetcheda41d8baadc8ed1710d81e2cbe6d8411edb4325e8. PR60 fetched6008fd48f91c92b732bf2f5972ade8672a0d26e3. PR58 independently moved to29b029aaa25b22fe9aff7d5f68119148b02da64f; read-only and excluded.

| File / set | Decision | Reconciliation / invariant |
|---|---|---|
| chapters.service.ts | Select exact PR59 delta | Full effective semantic/version guard; pricing-only428 exemption retained; same semantic replay no redundant CAS/metadata write; DTO/lease preserved |
| draft-chapters.repository.ts | Select exact PR59 delta | Timestamp protection before prose equality; only same immutable revision may no-op; distinct fresh source advances CAS/provenance |
| jobs/outbox-processor.ts | Select exact PR60 delta | Extraction-only; no generic worker canon approval; MONGO_DRAFT_SYNC and controller unchanged |
| core-reconciliation.live.test.ts | PR59 new7 native provenance tests | Reproduce on actual combined services/real PG/Mongo |
| jobs/outbox-processor.test.ts | PR60 six extraction-only tests | Replace obsolete autoapproval expectations, retain failure/retry/lease coverage |
| internal-revision-authorization.test.ts | Shared59/60 identical; one copy | Fail-closed HTTP auth fixture unit; no production auth edit |
| Pipeline_test/tools common9 helpers | Byte-identical59/60; one copy | Fresh resources, internal networks, fake transport; no parallel duplicate implementations |
| canon_hitl_probe.py | PR60 | Real Save/Accept extraction→pending→explicit author decisions, projection readbacks and route blockers |
| fe_core_contract_probe.py | PR59 with test-only policy reconciliation | Keep version/CAS/pricing/failure cases, replace inherited autoapproval observation with pending/explicit review gate; no weakened assertions |
| corrected P8 runners/helper/verifier/root runtime | PR60 six scripts | Explicit author canon review; legacy controller remains separated; no CI workflow change |
| New combined orchestration | Minimal new test-only runner | Exact clean source, fresh pair per invocation, no inherited PASS, independent evidence directory |
| PR59/60 review histories / large reports | Exclude | Read-only provenance references, never copy historical evidence into candidate |
| PR58 helper/database guard/CI files | Exclude | Gemini ownership; record partitioning dependency separately |
| AI memory/entity/HITL and FE S09–S11 | Investigate only | Missing implementation/acceptance is blocker; no alias or disabled gate |

WORKFLOW_CONTRACT v1.4 is authoritative over older promt.md auto-materialization wording. No API428 downgrade, wholesale merge/cherry-pick, schema rewrite, production provider or hidden approval. Existing writer lease, Mongo CAS, snapshot, outbox and P3 intent fences stay intact. Commit this decision before selective source/test integration.
