# Combined candidate source reconciliation

Decision matrix was committed **before** implementation: bb29eeee. Latest fetched base4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5; reference heads PR59a41d8baadc8ed1710d81e2cbe6d8411edb4325e8 and PR606008fd48f91c92b732bf2f5972ade8672a0d26e3. PR58 moved independently to29b029aaa25b22fe9aff7d5f68119148b02da64f and was excluded. Only own codex/p1-core-canon-combined worktree was modified.

Final clean combined source `c4d29c6b4039ea4060d0f91313bba62f88b7896a`. Source/test port0fd67675, branch-provenance correctionfc2a5670 and orchestration-name correctionc4d29c6b precede final verification/evidence. No merge/cherry-pick was used. No historical PR review directory was copied.

Production files exactly match reviewed reference blobs (PORT_PROVENANCE.json):

- chapters.service.ts from59: supplied version fences effective metadata and prose, same semantic replay avoids redundant mutations, content/title428 retained, pricing-only exemption retained. DTO, automatic snapshot and lease order unchanged.
- draft-chapters.repository.ts from59: timestamp guard precedes prose equality; no-op requires same accepted immutable revision. A different fresh revision advances version/provenance; newer author draft survives.
- jobs/outbox-processor.ts from60: extraction-only; generic worker has no Canon accept authority. MONGO_DRAFT_SYNC, claims/retries and separate controller unchanged.

Test/helper overlap resolution: common9 Pipeline_test helpers are byte-identical59/60; one selected copy. Internal authorization regression identical; one copy. New native7 from59 and six extraction-only unit tests from60 preserved. Native existing14 trust tests are unmodified. Smoke01A/02A/02B and verifier/helper/root runner are selectively copied from60, preserving explicit author review. Own runner now records actual candidate branch.

Only substantive test reconciliation is fe_core_contract_probe.py: inherited observation expected automatic approval; now waits for completed extraction with durable pending proposals, proves unchanged canon for Save/Accept and then explicitly approves ONLY current accepted revision groups via owner HTTP. Older superseded pending groups are left pending, not force-approved. Hash/outbox/metadata/version/failure checks remain. canon_hitl_probe separately proves reject/edit/stale/replay/ownership and missing-route blockers.

Own orchestration selects independent source suites on fresh DBs and records full skip reasons. An initial http.py name shadowed stdlib during requests import; renamed http_runtime.py. One concurrent subnet reservation collided; runtimes were restarted with fresh resources sequentially. Both genuine harness failures are retained, not claimed as product assertions or erased.

No edits to .github, Gemini lifecycle/helper/database guard, FE, AI production, migrations, accept-draft-contract.test.ts or PR58/59/60 branches. Candidate is DO NOT MERGE rehearsal, not a distributed-atomicity or full P1 certificate.
