# Core reconciliation source delta

Base integration `4c8bd3e36f7a8b01f7f98aee1e77b07779687fc5`. Read-only pipeline evidence `7e1e8e96d80f3d4a2602f5c53dcd5303bbea3be3`, verified source `dace9f9bc92f6b4209b8e6692985cfa8e3f805df`. Final clean tested source `990107caa9a915f7ba590d37dce912e7cccf1b09`. New managed worktree/branch codex/p1-core-reconciliation; existing primary pipeline and Gemini integration worktrees preserved. Fetch-all confirmed pinned heads; PR57 latest head is the integration base, not its older review checkpoints.

| Surface | Pipeline guarantee | Integration before | Decision / minimal delta |
|---|---|---|---|
| 428 / pricing exemption | Pipeline expectedVersion optional | Title/content require428; pricing exempt | Preserve integration exactly; do not port optional policy |
| Stale semantic metadata | Full effective body/title/VIP/price checked before mutations | Existing explicit stale metadata guard, but retry still rewrites PG timestamps; pricing-only supplied version does not consume CAS | Fence all provided versions, compare effective payload, skip redundant Mongo/PG writes; retain publication transaction/schedule behavior for actual edits |
| Reconciliation freshness/provenance | Latest guard, newer timestamp guard, identity-specific no-op | Prose-equality branch precedes timestamp guard and writes a different accepted ID/time without CAS increment | Remove prose-only update shortcut; freshness first, then same applied revision+marker+fields no-op; different revision goes through normal guarded Mongo update/version |
| Snapshot replay | Reused revision uses original creation timestamp | Checkpoint never reconciles Mongo draft | Keep integration strategy unchanged; real snapshot replay test proves manual draft untouched while revision/outbox remain canonical |
| Response version / DTO | Leased final Mongo read | Already reads authoritative Mongo and returns unified draft DTO | Preserve unchanged; real next-save and active baseline tests pass |
| Accept / tenant / P3 fences | Authenticated lookup, source/hash/latest/idempotency fences | Current PR57 remediation has these guards | Unchanged; protected Gemini 14-test contract passes with correct fresh schema |
| Canon approval | Pipeline worker creates proposals only | Integration worker auto-accepts groups | Genuine FAIL, not silently ported or changed; requires separately scoped policy/worker reconciliation |
| Memory / entity-review | Pipeline supports routes | Gateway references absent AI routes | Document blocker; SQL canonical and context-preview data proof is not a product API repair |

Production edits: only chapters.service.ts and draft-chapters.repository.ts. Snapshot/accept/auth/worker, CI, protected accept test, FE and all AI source are unchanged (OWNERSHIP_BOUNDARY_AUDIT.json). Test-only containment helpers were selectively extracted from pipeline; no architecture or branch wholesale merge. Harness adapts to integration's existing proposal review and OpenAI-compatible fake transport. No real provider keys/calls. Context status field absence is reported, not inferred as PASS.
