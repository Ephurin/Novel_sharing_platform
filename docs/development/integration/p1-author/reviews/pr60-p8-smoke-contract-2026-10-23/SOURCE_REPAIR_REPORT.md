# Bounded source repair

Only six test/validation scripts changed relative to PR60 initial043b21e2:

- canon_review_smoke.py: real PG projection snapshots and latest immutable source/hash/outbox checks; source-scoped pending queue via authenticated Node Gateway; explicit author accept with current brain version; stale/version/replay409 and durable exactly-once checks. No direct canon writes or SQL-faked lifecycle.
- run_ai_pipe_02a_idea_bootstrap.py checkpoint11 now performs that review after outbox completion; capture approved canon before acceptDraft. Existing hash/source/owner/DTO/idempotency assertions kept.
- run_ai_pipe_02b_outline_planning.py checkpoint12 had the same assumption; now uses the same explicit gate. Snapshot wording corrected.
- run_ai_pipe_01a_production_persistence.py checkpoint12 no longer tolerates an auto-materialized branch. Existing future-plan/context/author-control and revision assertions retained.
- verify_ai_pipe_02a_idea_bootstrap_evidence.py requires pending/unchanged/authorized/exactly-once evidence and adds4 negative mutants to existing8.
- run_pr60_root_smoke.py: explicit fresh-resource opt-in, random project/database/ports, root-compose plus isolated overlay, internal network, fake providers and no live keys; executes existing runners/verifiers inside AI container because internal networks intentionally do not publish host ports. Stops only its new containers and preserves volumes; propagates nonzero command exits.

No production Canon worker, FE, Gemini CI isolation, PR58/59, migrations or API contracts changed. Initial line-ending noise was normalized before final verification; final net diff is bounded to scripts.

Local root-compose variation is resource isolation/provider safety only: five root services, default migrations/demo seed, fake generation and fake embeddings match smoke mode. Full cutover CLI parity/backup steps and every route unit job were not replayed here; old CI records their earlier status but those results are not counted as new PASS.

Source commits precede evidence. Root smoke is an offline structural proof; existing PR60 HITL/entity-route/integration blockers remain outside this resume. Legacy P3 PASS is not a HITL or unattended100k certification.
