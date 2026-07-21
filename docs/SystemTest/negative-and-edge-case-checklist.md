# Negative and Edge Case Checklist

Use this checklist after happy-path API/Web E2E tests pass.

Goal: prove the MVP fails safely when users, data, roles, or payment state are wrong.

## 1. Auth and Token Negative Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-AUTH-001 | Login with wrong password. | Returns/prints standard auth error; web shows actionable error. |
| NEG-AUTH-002 | Call protected API without token. | `401`, standard response envelope. |
| NEG-AUTH-003 | Call protected API with malformed token. | `401`, no crash. |
| NEG-AUTH-004 | Delete token from browser storage and refresh protected route. | Redirects to `/login`. |
| NEG-AUTH-005 | Login locked user if test data exists. | Access blocked or permission state shown. |

## 2. Role and Ownership Negative Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-RBAC-001 | Reader opens `/admin`. | Permission state; no admin data rendered. |
| NEG-RBAC-002 | Author opens `/admin/users`. | Permission state; no admin data rendered. |
| NEG-RBAC-003 | Reader opens `/author`. | Permission state; no author data rendered. |
| NEG-RBAC-004 | Reader calls author novel/chapter mutation API. | `403` or role error. |
| NEG-RBAC-005 | Author A edits Author B novel/chapter if second author exists. | `403` or ownership error. |
| NEG-RBAC-006 | Reader attempts to update/delete another reader's comment. | `403` or ownership error. |

## 3. Validation Negative Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-VAL-001 | Use invalid UUID in route param. | `400`, `VALIDATION_001`, field error mentions UUID. |
| NEG-VAL-002 | Submit empty novel title. | `400`, validation error. |
| NEG-VAL-003 | Submit too-short synopsis where required. | Validation error or disabled UI action. |
| NEG-VAL-004 | Submit empty comment. | Disabled UI action or validation error. |
| NEG-VAL-005 | Save reading preference with invalid font size below/above allowed range. | `400`, validation error. |
| NEG-VAL-006 | Create wallet deposit with invalid amount. | `400`, validation error. |

## 4. Reader Interaction Edge Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-INT-001 | Like same novel twice. | Friendly already-liked/conflict handling; no crash. |
| NEG-INT-002 | Unlike novel not liked. | Friendly not-found/no-existing-like handling. |
| NEG-INT-003 | Follow same author twice. | Friendly already-followed/conflict handling. |
| NEG-INT-004 | Unfollow author not followed. | Friendly not-found/no-existing-follow handling. |
| NEG-INT-005 | Add same novel to library twice. | Friendly already-saved/conflict handling. |
| NEG-INT-006 | Remove novel not in library. | Friendly not-found handling. |

## 5. VIP and Wallet Edge Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-WALLET-001 | Read VIP chapter before unlock. | `402`, `PAYMENT_002`, locked UI. |
| NEG-WALLET-002 | Unlock VIP chapter with insufficient balance. | Payment/balance error; no unlock row created. |
| NEG-WALLET-003 | Unlock same VIP chapter twice. | Idempotent success or conflict handled; no double charge. |
| NEG-WALLET-004 | VIP chapter has `is_vip=true` and `price_coins=0`. | Treat as invalid test data; fix data before official wallet test. |
| NEG-WALLET-005 | Donate more coins than balance. | Payment/balance error; no negative wallet balance. |
| NEG-WALLET-006 | Withdraw more coins than balance. | Payment/balance error; no pending withdraw created. |

## 6. Moderation Edge Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-MOD-001 | Submit comment containing active banned keyword. | Comment hidden/pending and moderation review created. |
| NEG-MOD-002 | Report same target multiple times from same/different users. | Report count/review behavior remains stable; no crash. |
| NEG-MOD-003 | Resolve an already resolved review. | Conflict response; status unchanged. |
| NEG-MOD-004 | Reject review without reason via API if required. | Validation/domain error. |
| NEG-MOD-005 | Non-admin calls moderation list/detail/resolve. | `403`; no moderation data returned. |

## 7. Network and Error-State Cases

| ID | Steps | Expected |
| :--- | :--- | :--- |
| NEG-NET-001 | Stop backend, refresh `/reader`. | Error state or network error shown, not blank page. |
| NEG-NET-002 | Stop backend while saving author draft. | Error shown; draft UI remains editable. |
| NEG-NET-003 | Restart backend and click Retry if available. | Data reloads. |
| NEG-NET-004 | Use wrong `VITE_API_BASE_URL`. | Network error is visible and diagnosable. |

## 8. Recording Rule

For each negative case, record:

- expected error code/status;
- actual error code/status;
- UI message;
- whether data was accidentally mutated;
- screenshot or request/response evidence.
