# PR65 final P1 acceptance — execution lease

Reviewed parent: `e63fc8c5a12aac0ce258cf360359f3ec3dca4a28`.
Integration base: `6de87f575ee2e3d114ee83159c2b335667a62e7f`.
Working branch: `codex/p1-fe-final-acceptance`; dedicated managed worktree.
Draft child PR targets `gemini/p1-author-ide-hitl-integration`; no rewriting Gemini history.

Authority: [GPT-6 findings FE-15–FE-19](https://github.com/Ephurin/Novel_sharing_platform/pull/65#issuecomment-6382474986), [handoff](https://github.com/Ephurin/Novel_sharing_platform/pull/65#issuecomment-6382508494), original INTEGRATION_GATE.md. [Write freeze/ownership lease](https://github.com/Ephurin/Novel_sharing_platform/pull/65#issuecomment-6382533654) published before modifications.

| Finding | Required closure |
| --- | --- |
| FE-15 | Remove browser runtime destination overrides; actual browser two-origin RED/GREEN verifies no Authorization request can reach the untrusted origin. Keep build-time API config and auth/cookie behavior. |
| FE-18 | Preserve canonical spelling and whitespace exactly; bounded Latin/Vietnamese/combining/Greek/Armenian/ligature casefold contract with explicit unsupported-input error. Actual Python validate_author_edit round trips plus all code points of the supported ranges, no universal Unicode claim. |
| FE-19 | Independently test correction author marker + immutable evidence + separate Canon transaction; remove ingress credentialed CORS reflection; make fake structured output source-grounded, exact-ID and fail closed. Preserve legacy offline scenarios. |
| FE-16 | Real built SPA on a trusted same-origin proxy, actual Gateway/Python, fresh isolated PG/Mongo. Browser-driven review/Canon and ordered writer/Undo/409/navigation/reload/isolation; no optional locator skips or SQL-seeded rejection. G4 results explicit by feature. |
| FE-17 | Append-only actual command/exit records, source/tree, sanitized topology/config, migrations, all suites, browser request/response counts, full scoped SQL/Mongo readbacks, Canon transitions, screenshots/redacted trace, fake-only counts and owned cleanup. |

Current evidence from Gemini stays historical **PARTIAL smoke**. All new browser gates start NOT_RUN until executed; final gate matrix will record PASS/FAIL/PARTIAL/NOT_RUN individually. Source/test commits precede final clean-SHA validation and a separate evidence commit. No old CI result proves the new source.

Only newly created task-owned projects, volumes, networks and localhost ports may be used. Production workers/provider gateway remain internal; a test-only bridge has fixed DB/Gateway TCP destinations, never a request-selected proxy. Standalone Docker Compose is installed on this host. No other task containers are reused/stopped/restarted/deleted.

No live provider calls, quota use, deployment, main changes or PR57/PR65 merges. Future live model policy remains primary Gemini 3.5 Flash Lite, explicit fallback Gemini 3.1 Flash Lite; no 2.5. Offline acceptance does not establish production/live-model readiness. Stop for independent review.

## S10 contract delta found during acceptance

The old consistency checker used entity creation-time status instead of approved projected status. A real SPA run and memory/PostgreSQL RED at source `35d2e94dafe04b0ee35b3696fbeaf09bebbea089` reproduced an empty findings list after an authorized status correction.

`POST /api/v1/ai/story-brains/:novelId/author-operation` with `operation=check_consistency` now requires `chapter_id`, `revision_id`, `content_hash` and the exact saved `content`. The mounted AuthorMemoryPanel obtains these from the existing Core revision API. Python reuses the existing HITL immutable-source validator. Missing/invalid source is 422, absent revision is 404, foreign tenant is 403; no fabricated `rev-mock` provenance. Existing text-only callers must supply a real Core revision before using this operation. Other author operations are unchanged.

Findings reference approved current state by UUID. A unique-name contradiction returns `entity_id`, exact evidence and verified `revision_id`. A homonym warning returns `code=AMBIGUOUS_ENTITY_REFERENCE` and `candidate_entity_ids`, without assigning a guessed `entity_id`. This operation creates no proposal, decision, Canon artifact or Brain version increment. Canon correction remains the existing separately authorized proposal/atomic approval workflow.

The fake provider now leaves candidates unresolved whenever an approved inventory exists. It never selects an existing homonym or creates a provisional group. Production verification remains strict; fake-only invalid decisions caused a separately retained outbox RED and three focused RED/GREEN tests.
