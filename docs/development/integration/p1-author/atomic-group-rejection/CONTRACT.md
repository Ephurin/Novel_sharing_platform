# Atomic dependency group rejection — FE contract v1

Base: `2eca7f19c20a71202d7c827af2e15d8fb6dc88bb`. Published before implementation.
Owner: backend/AI-service; consumer: Gemini FE PR #65. Backend review and merge remain separate gates.

## Public contract

`POST /api/v1/ai/proposal-groups/{groupId}/reject`

Requires an active AUTHOR owning the resolved novel (existing ADMIN privilege is preserved).
Gateway resolves the group through the trusted Python lookup; neither novel, actor nor tenant is taken from the request body. Python remains an internal service-token boundary and validates configured tenant and authenticated author UUID headers. This new transactional endpoint requires PostgreSQL; unsupported repositories return 503.

```typescript
export interface RejectDependencyGroupRequest {
  expected_brain_version: number; // integer >= 1; current approved memory version
  reason?: string | null;
}
export interface RejectDependencyGroupResult {
  group_id: string;
  proposal_ids: string[]; // every persisted member, materialization order then UUID
  status: 'rejected';
  brain_version: number; // unchanged by rejection
}
// Gateway: { success: true, data: RejectDependencyGroupResult, ...standard envelope }
// Python: { data: RejectDependencyGroupResult, meta: { request_id, schema_version: 1 } }
```

Example request: `{"expected_brain_version":5,"reason":"Author rejects this group"}`.
Example success data: `{"group_id":"<uuid>","proposal_ids":["<A>","<B>","<C>"],"status":"rejected","brain_version":5}`.
Unknown body fields, including client membership/actor/novel overrides, return 422.

## Transaction and concurrency

The authoritative repository locks the scoped Brain first, validates the current expected version, then locks **all** persisted group members, including decided members. Every member must be pending. All statuses and one reject decision per member commit together; any validation or persistence error rolls back everything. Decisions record the authenticated actor and supplied reason. No approved entity, event, fact, transition, relationship or projection is created or changed. Brain version does not increment.

Rejection can discard an obsolete pending analysis group: its creation version need not equal today's version, but the submitted expected version must equal today's Brain version. No latest-chapter evidence check is required to discard pending work. Acceptance retains its stronger source/version/dependency validation.

Brain-before-proposals locking serializes acceptance against rejection. Acceptance first: rejection conflicts without mutation. Rejection first: acceptance conflicts without materialization. Repeated group rejection returns 409 without additional decisions; FE should reload the review queue/memory after conflict rather than loop individual requests.

## Status handling and compatibility

| Status | Meaning / FE action |
| --- | --- |
| 200 | Entire persisted group rejected; remove it from pending UI; approved memory/version unchanged. |
| 401 | Missing/invalid public JWT; reauthenticate. |
| 403 | Inactive/wrong-role/foreign owner or trusted tenant mismatch; no mutation. |
| 404 | Group/Brain absent in authorized scope; reload queue. |
| 409 | `BRAIN_VERSION_CONFLICT` or `PROPOSAL_ALREADY_DECIDED`; reload memory and queue, never auto-approve/reject siblings. |
| 422 | Invalid request or single-reject of a multi-member group (`INVALID_PROJECTION`); use this endpoint for that group. |
| 503 | Transactional PostgreSQL repository unavailable/unsupported; no fallback writes. |
| 500 | Unexpected persistence failure; transaction rolled back; reload before retry. |

Python errors use `{"detail":{"code":"BRAIN_VERSION_CONFLICT"}}` (similarly `PROPOSAL_ALREADY_DECIDED`, `PROPOSAL_GROUP_NOT_FOUND`); Gateway preserves status/code in its standard error envelope.

`POST /api/v1/ai/proposals/{proposalId}/reject` keeps its existing `{reason?}` request and `{proposal_id,status}` success for genuine singleton groups. Selecting one member of a multi-member group now fails closed inside the repository transaction. Gemini must replace the rejection loop with **one group request**, using the group UUID and approved memory version; do not submit proposal counts or derive membership in FE. There are no new states, migrations, staged decisions or Canon approval semantics.

## Inspected paths and authority

- Gateway `ai-gateway.routes.ts`, `rejectProposalController`, `acceptProposalGroupController`, `assertNovelOwnership`, authenticated header forwarding.
- Python narrative reject/single-accept/group-accept routes; `NarrativeApplicationService.reject_proposal[_by_id]`, group resolution and acceptance entry points.
- PostgreSQL `decide_proposal` previously locked only the selected proposal; acceptance already locks Brain then full persisted group (C-01).
- `ProposalDecisionRecord` already supports reject + actor + reason; no schema change needed.
- Single repository reject and group reject must share one transactional invariant. JSON/in-memory are not authoritative transactional stores and must not simulate the new public group operation.

Acceptance H-01–H-05, B1/B4/B5/B6 and C-01, default OFF flag, author-only Canon authority and extraction-only outbox remain the compatibility baseline. Mounted browser execution is Gemini's later gate.
