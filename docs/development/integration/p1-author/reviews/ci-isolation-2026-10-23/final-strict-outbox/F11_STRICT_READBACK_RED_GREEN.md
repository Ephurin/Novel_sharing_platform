# F-11 Strict Readback Fail-Closed Verification Report

**Review Finding:** F-11 — Malformed PostgreSQL readback must fail closed  
**Component:** `backend/src/modules/novels/test-fixture-lifecycle.ts`  
**Test Suite:** `backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts` (Matrix 18)

---

## 1. Vulnerability Analysis

### Root Cause
Prior to F-11 remediation, post-cleanup authoritative readbacks in `TestFixtureLifecycle.cleanup` used lenient type casting:
```typescript
const count = Number(cRes.rows[0]?.count ?? 0);
```

### Failure Mode
If a query returned malformed results:
- Missing `rows` or empty `rows: []` -> `rows[0]` is `undefined` -> `?? 0` evaluated to `0`.
- Missing `count` or `count: null` -> `?? 0` evaluated to `0`.
- Invalid string/NaN count -> `Number('invalid')` evaluated to `NaN` or unhandled falsy values.

In all these malformed scenarios, `count !== 0` evaluated to `false`, allowing broken queries to masquerade as verified zero-residual database state, returning `{ cleaned: true }` and transitioning stage to `CLEANED`.

---

## 2. Strict Fail-Closed Implementation

We introduced `parseStrictRowCount`:
```typescript
export function parseStrictRowCount(queryResult: any, entityName: string, entityId: string): number {
  if (!queryResult || typeof queryResult !== 'object' || !Array.isArray(queryResult.rows)) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: query result missing rows array`);
  }
  if (queryResult.rows.length !== 1) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: expected exactly 1 row, received ${queryResult.rows.length}`);
  }
  const row = queryResult.rows[0];
  if (!row || typeof row !== 'object' || !('count' in row) || row.count === null || row.count === undefined) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: count column missing or null in result row`);
  }
  const rawCount = row.count;
  const parsed = typeof rawCount === 'number' ? rawCount : Number(rawCount);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: invalid count value (${String(rawCount)})`);
  }
  return parsed;
}
```

### Fail-Closed Invariants:
1. Result MUST contain a valid `rows` array with exactly 1 row.
2. Row MUST contain a non-null, defined `count` field.
3. Count MUST be a finite, non-negative integer.
4. Any violation throws an explicit descriptive error identifying the entity type and entity ID.
5. In `TestFixtureLifecycle.cleanup`, catching this error retains the entity in `this.pending` and transitions lifecycle to `CLEANUP_FAILED`.
6. Applied uniformly across:
   - Primary fixtures: `pgChapters`, `pgNovels`, `pgUsers`, `pgRevisions`, `pgOutboxEvents`, `pgOutbox`
   - Sentinels: `confirmedSentinelPgUsers`, `confirmedSentinelPgNovels`, `confirmedSentinelPgChapters`
   - Teardown sentinels: `sentinelPgChapters`, `sentinelPgNovels`, `sentinelPgUsers`

---

## 3. RED / GREEN Verification

### RED Phase
- Mocked `SELECT count(*) FROM users WHERE user_id = $1` returning `{ rows: [] }`.
- Prior implementation: `Number(rows[0]?.count ?? 0)` returned `0`, returned `{ cleaned: true }` (CONFIRMED RED).

### GREEN Phase
- With `parseStrictRowCount`:
  - Empty rows: Threw `Malformed PostgreSQL readback for user <uId>: expected exactly 1 row, received 0`.
  - Stage transitioned to `CLEANUP_FAILED`.
  - Pending set preserved `uId`.
  - Recovery retry with genuine pool deleted user and verified `CLEANED` with 0 residual records.
- Matrix 18 test executed: PASS (exit code 0).
