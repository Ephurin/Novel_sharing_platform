# Review handoff — bounded FE/Core contract spike

Verdict: **BLOCKED_RUNTIME_OR_SOURCE_INCOMPATIBILITY**. Review CONTRACT_DECISION_PROPOSAL.md, COMPATIBILITY_TEST_MATRIX.md, SOURCE_DIFF_AND_PROVENANCE.md and validation.json. No release/integration self-approval.

The spike adds only a focused test-resource allocator and API/persistence probe. It does not edit Core production policy, FE code, existing migrations or historical reports. Pipeline was fast-forwarded from clean f296f8b to verified remote 3cf18c93b74d62f1f2a3b13f8f034d9d107c6049. Test source commits are separately recorded in provenance; evidence is a later commit. Current PR54/55 and Issue56 were rechecked read-only through GitHub.

New tests run against actual isolated Core backend/AI Service/PostgreSQL/MongoDB with explicit mutation opt-in and fake HTTP upstream. Only one canonical checkpoint is exercised for this contract, not completed P123 suites or Mongo reconciliation fixture repair. Core and PR55 are not merged. PR55 hook/browser and API results are inherited from immutable earlier evidence, explicitly separated from new runtime.

Main decisions: optional-versus-required version/428 rollout; full semantic payload identity for stale replay; preserving ordered writer/CAS/automatic anchored-baseline revision/outbox while porting FE reliability. A new stale body/title + changed pricing counterexample must not be hidden by a test-only production patch. Recommended changes are unapplied and need named owner approval.

Final clean tested SHA: a2ec488035728e4135d65e664838044f0ec41646 (production backend/AI/web bytes unchanged from 3cf18c9). Final probe records 10 PASS / 3 FAIL, process exit 1. Besides stale pricing, active-save response version lags durable Mongo (9 vs 10), and same-source replay increments Mongo again (10 → 11). These failures directly block treating PR55's hook as compatible with active-baseline Core saves. Exact proposed lease-preserving response/no-op repair hunks are in the decision proposal, unapplied.

The first runtime's idea baseline was active with null baseline_revision_id, so it did not satisfy Core's automatic-save predicate. It is retained, and a test-only correction uses one real manuscript revision and supported review/activation in a fresh environment. No SQL baseline/canon fabrication or historical fixture changes.

Full S09, actual editor lifecycle and integrated hook-to-Core browser compatibility remain BLOCKED/NOT_RUN until D1/D2 and FE implementation approval. Issue56 remains open; S10/S11, provider quality, 100k, publishing, payments and production deployment are outside scope. No FE commits were merged/cherry-picked, no main writes, no real model/embedding calls or charges.

Reproduce only in new resources: prepare_fe_core_contract.py --manifest NEW_FILE --allow-new-test-resources, then the exact compose/probe commands in commands-and-exits-03.json. fe_core_contract_probe.py requires --allow-test-mutations and refuses non-owned project names via the shared probe preflight. It intentionally returns nonzero for a genuine incompatible contract row; examine row results and durable readbacks rather than treating a shell wrapper's successful teardown as a passing probe. Retained stopped volumes are review evidence, not disposable historical cleanup targets.
