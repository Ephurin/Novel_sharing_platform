# ASTRA FE/backend integration preflight

**INTEGRATION_PREFLIGHT_COMPLETE_WITH_BLOCKERS — STOP FOR GPT-6 REVIEW.** `HOLD_FE_INTEGRATION_ONLY`; merge/deploy not authorized.

- [FE_BACKEND_DELTA_MATRIX.md](FE_BACKEND_DELTA_MATRIX.md):18 contracts, pinned PR52/54/55 SHAs, severity and FE/Core owner decisions.
- [MIGRATION_COLLISION_MATRIX.md](MIGRATION_COLLISION_MATRIX.md): actual18-file SQL union + AI0013 on fresh empty PG, including newly identified017 requirement; runner repeat and readback.
- [S09_FE_HANDOFF.md](S09_FE_HANDOFF.md): new-hook fixture PASS, historical full-editor S09 RED still unverified, Issue56 open and exact FE follow-up.
- [P123_INTEGRATION_GATE_MATRIX.md](P123_INTEGRATION_GATE_MATRIX.md): separate acceptance boundaries and **new runtime P0 CORE_DRAFT_READ_SCOPE**.
- [commands-and-exits.json](commands-and-exits.json), [validation.json](validation.json), [source-checks.json](source-checks.json), [source-evidence.json](source-evidence.json).

The private draft finding is a **different endpoint** from the closed job-resume authorization blocker: `GET /api/v1/chapters/:chapterId` on pipeline26a6cbc4 discloses synthetic unpublished draft content to anonymous and unrelated AUTHOR. Raw sanitized responses are in read-authz-red/. No production fix was implemented without a separately scoped owner instruction. PR55's separate API denies401/403; its full backend cannot be substituted wholesale because it would lose Core writer/outbox/job/intent behavior.

## Replay and evidence discipline

Captured immutable inputs: pipeline26a6cbc4c562dd5c496ce446efb55bb297ee3dca, PR55 7b15c078c1ffe2fca96c4e66c96577e3ff007c3c; refs/metadata for main/PR52/54 are in snapshots. Both source worktrees were clean at runtime, and Core production files are unchanged from tested authz source7d1f1be. All new outputs are evidence-only.

Execution scripts are included as records of the actual commands, with this Windows machine's absolute temporary paths. They are **not a portable one-command test runner**: reproduce in a NEW output directory/project, adjust only external test-harness/source-worktree paths, regenerate private env via the existing prepare_p123_headless.py helper, build/verify the pinned Docker images if absent, and install locked Node/Python dependencies and headless Edge. Do not reuse prior output names, identities or credentials, overwrite old artifacts, or copy secrets into Git. Scripts retain existence guards and image IDs/source hashes for the performed run. The unmodified browser test was copied to an empty external layout with read-only-by-convention source junctions so its relative artifact path cannot overwrite tracked FE evidence. Source equality/cleanliness was checked; no production code was edited.

Requirements used: Docker with standalone docker-compose, Node22/tsx, Python3.12/requests, PR55 locked web dependencies and Playwright with msedge. SQL runner and Alembic execute inside the pinned owned images; application/API/browser fixtures run separately against the new PG/Mongo with only local AI port9 configured. No native provider/controller worker was launched. The first browser infrastructure failure is retained and not counted as a hook regression.

Raw browser trace remains private; the committed ZIP is JWT-redacted. integrity-sha256.json hashes text after CRLF→LF normalization and PNG/ZIP as exact binary bytes; verify staged/committed Git blobs rather than relying on Windows checkout endings. The manifest intentionally excludes itself. Historical Codex/Gemini/Astra evidence and Docker volumes were preserved. New synthetic security fixtures remain in the owned DB; the upstream hook fixture removes only its own newly generated schema/Mongo DB during its normal test cleanup.

No comment/message was sent to FE owners or GitHub issues. These artifacts hand off proposed tasks; they do not authorize new implementation, merge, S09 closure or a new acceptance phase.
