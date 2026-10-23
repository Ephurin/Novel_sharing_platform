# G-02 Strict PostgreSQL Count Parsing Report

**Review Finding:** G-02 (P2) — Strict PostgreSQL count parsing  
**Component:** `backend/src/modules/novels/test-fixture-lifecycle.ts`  
**Test Suite:** `backend/src/modules/novels/fixture-lifecycle-resilience.postgres.test.ts` (Matrices 18, 24, 25)

---

## 1. Vulnerability Analysis

### Root Cause
In the initial F-11 implementation, `parseStrictRowCount()` performed:
```typescript
const parsed = typeof rawCount === 'number' ? rawCount : Number(rawCount);
```
JavaScript `Number(x)` permits unsafe coercions:
- `Number('')` === `0`
- `Number('   ')` === `0`
- `Number(' 0 ')` === `0`
- `Number(false)` === `0`
- `Number([])` === `0`
- `Number('0e0')` === `0`
- `Number('0x0')` === `0`
- `Number('-0')` === `-0` (converts to `0`)
- `Number('0.0')` === `0`
- Large integer strings beyond `Number.MAX_SAFE_INTEGER` silently lose precision without throwing.

These non-canonical or empty inputs could be coerced to `0`, masquerading query or parsing anomalies as valid zero counts.

---

## 2. Hardened Architecture & Implementation

```typescript
const CANONICAL_DECIMAL_COUNT = /^(?:0|[1-9][0-9]*)$/;

export function parseStrictRowCount(queryResult: unknown, entityName: string, entityId: string): number {
  const fail = (reason: string) =>
    new Error(`Malformed PostgreSQL readback for ${entityName} ${entityId}: ${reason}`);

  if (!queryResult || typeof queryResult !== 'object' || !Array.isArray((queryResult as any).rows)) {
    throw fail('query result missing rows array');
  }
  const rows: unknown[] = (queryResult as any).rows;
  if (rows.length !== 1) {
    throw fail(`expected exactly 1 row, received ${rows.length}`);
  }
  const row = rows[0] as any;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    !Object.prototype.hasOwnProperty.call(row, 'count') ||
    row.count === null ||
    row.count === undefined
  ) {
    throw fail('count column missing or null in result row');
  }

  const rawCount: unknown = row.count;
  if (typeof rawCount === 'number') {
    if (!Number.isSafeInteger(rawCount) || rawCount < 0 || Object.is(rawCount, -0)) {
      throw fail(`invalid numeric count (${String(rawCount)})`);
    }
    return rawCount;
  }
  if (typeof rawCount === 'string') {
    if (!CANONICAL_DECIMAL_COUNT.test(rawCount)) {
      throw fail(`count is not a canonical non-negative decimal string (${JSON.stringify(rawCount)})`);
    }
    const parsed = Number(rawCount);
    if (!Number.isSafeInteger(parsed)) {
      throw fail(`count exceeds safe integer range (${rawCount})`);
    }
    return parsed;
  }
  throw fail(`unsupported count type ${Array.isArray(rawCount) ? 'array' : typeof rawCount}`);
}
```

### Strict Criteria Enforced
1. Result MUST be an object with an array `rows` of length exactly 1.
2. Row MUST be an object with an own property `count`, not null or undefined.
3. If numeric: MUST be a safe integer >= 0, and not `-0`.
4. If string: MUST match `/^(?:0|[1-9][0-9]*)$/` (canonical non-negative decimal string without signs, spaces, decimals, or exponents) AND parsed value MUST be <= `Number.MAX_SAFE_INTEGER`.
5. All other types (boolean, array, object, symbol) throw immediately.
6. Applied across all fixture and sentinel readback verification queries.

---

## 3. RED / GREEN Evidence

### RED Phase
In Matrix 24, all coercible mutants were tested against the prior implementation:
- `empty string`, `whitespace string`, `padded decimal`, `exponent`, `hex`, `binary`, `signed plus`, `negative zero string`, `fractional string`, `boolean false`, `array`, `unsafe number`, `unsafe decimal string` were all silently accepted as valid `0` counts (CONFIRMED RED).

### GREEN Phase
- With G-02 canonical parsing:
  - Matrix 24: All 21 mutants are strictly rejected across fixture readback (Step 8), sentinel preservation (Step 9), and sentinel teardown readback (Step 11), entering `CLEANUP_FAILED` and recovering to `CLEANED` with genuine pools.
  - Matrix 25: 41 invalid input variants verified rejected, while valid decimal strings (`'0'`, `'1'`, `'42'`, `'9007199254740991'`) and numbers parse accurately.
