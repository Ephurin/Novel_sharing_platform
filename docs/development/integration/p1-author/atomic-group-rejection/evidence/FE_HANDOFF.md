# Gemini FE PR #65 — replace individual rejection loop

Backend source: `e0c0e72651d2fd7eb52b82fdf53932aa4e849123`, Draft [PR #66](https://github.com/Ephurin/Novel_sharing_platform/pull/66), base `integration/p1-author` at `2eca7f19c20a71202d7c827af2e15d8fb6dc88bb`. Independent review/merge required before treating the endpoint as integrated. Do not merge/cherry-pick this backend automatically.

**BACKEND_READY for review; FE_ACTION_REQUIRED.** Final typed request/response: [contracts.ts](../contracts.ts); the contract was [published before implementation](../CONTRACT.md).

Call **once** per group, using the group's `dependency_group_id` UUID and current approved memory's `brain_version`:

```http
POST /api/v1/ai/proposal-groups/<groupId>/reject
Authorization: Bearer <active-owning-author-JWT>
Content-Type: application/json

{"expected_brain_version":5,"reason":"Author rejects this group"}
```

```json
{"success":true,"data":{"group_id":"<groupId>","proposal_ids":["<A>","<B>","<C>"],"status":"rejected","brain_version":5},"error":null,"meta":{}}
```

All persisted pending members and one auditable decision/member commit together. No Canon changes or version increment. Rejecting does not approve or materialize anything. Display the returned group as rejected/remove it from pending queue and reload queue/memory. An obsolete pending revision group can be discarded with today's Brain CAS; no fabricated latest revision or client membership list is needed.

Example failures:

```json
{"success":false,"data":null,"error":{"code":"BRAIN_VERSION_CONFLICT","message":"..."},"meta":{}}
```

```json
{"success":false,"data":null,"error":{"code":"PROPOSAL_ALREADY_DECIDED","message":"..."},"meta":{}}
```

- 401: reauthenticate. 403: inactive account, wrong role/owner or forbidden scope; do not retry writes.
- 404 `PROPOSAL_GROUP_NOT_FOUND`: reload pending queue; no mutation.
- 409 version conflict or any decided member (including repeat rejection): reload memory and queue; do not fall back to individual rejection. A successful acceptance racing this call causes rejection conflict; a successful rejection prevents acceptance.
- 422 `INVALID_PROJECTION`: selected member belongs to a multi-item group; call the group endpoint. Invalid/missing expected version or unknown fields also return 422 (standard validation code through Gateway).
- 503 `GROUP_REJECTION_REQUIRES_POSTGRES`: no transactional fallback. 500: persistence failure, entire transaction rolled back; reload before manual retry.

Never submit tenant, novel, actor, proposal count or `proposal_ids` in this request. Gateway derives ownership/scope from the group and JWT. Client-injected fields are rejected. Keep current single route `/api/v1/ai/proposals/{proposalId}/reject` with `{reason?}` only for **genuine singleton groups**; multi-member use now fails closed transactionally. A repeated single rejection remains 409 at HTTP.

Acceptance payloads, provisional identity lifecycle, refresh/freeze/continue, Canon editing, exact-ID relationship locks and default OFF flag are unchanged. There are no new states or staged individual decisions.

Executable fixtures:

- `ai-service/tests/test_atomic_group_rejection.py`: genuine HITL entity/event/fact/state group; partial reject guard, atomic rejection/audit/no Canon version change, true singleton, stale/scope/auth/schema failures, missing/decided group, accept/reject races, retry deduplication, final-decision PG trigger rollback.
- `backend/src/modules/ai/p1-memory-entity.live.test.ts`: real Gateway requests, two human-distinguished Minh identities, exact edited Canon/lock flow, multi-item event correction rejected atomically, owning actor audit, foreign/inactive/anonymous/stale/invalid request readbacks, singleton compatibility.
- Commands/env/resources for rerun are recorded in `tooling/group_rejection_final_runner.py`, `commands.json`, `green/resources.json`. Copy the runner into a new scratch directory and set its ROOT to a clean checkout of the source above; run `provision`, `migrate`, then `test-accept-rejection` (and the other recorded suite modes). Never execute tooling in the historical evidence directory. Provision **new owned resources**, never reuse another task's containers or production. Only fake providers.

Mounted browser acceptance remains **NOT_RUN**. Gemini owns production FE controls/browser evidence and must verify one network request per group, error/reload handling, no partial rejected group, no Canon/version change and no cross-account mutation. No UI substitute or backend-only test constitutes browser PASS.
