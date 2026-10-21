# WF1F-S09-001 — stale autosave after undo

Status: confirmed product defect; proposal only, NOT APPLIED. The active Wave1F task §0.5 permits harness changes and requires a separate proposal for product/FE defects.

Affected source: `web/src/features/author-ide/AuthorWritingIde.tsx:452–465`, tested at `34fff042c3272e9661f7bf7163f290b4b5483568`.

1. Open the owned chapter 6 with its saved body B.
2. Append the temporary line A, then restore B within 1,200 ms (observed 0.263885 seconds).
3. Wait for autosave. The editor remains B, but server draft and latest immutable revision contain A.

Actual evidence: `../../runs/2026-10-21-p1-wave1f-workflow-01/browser-incremental-resume-01/S09-debounce-readback.json`, its ACT-S09 PNG/DOM/Playwright trace bundles, and `S09_DEFECT_PROOF.json`. Bad revision: `737c2025-d940-44b7-b3d5-7ea31b112123`. The browser result's generic `BLOCKED_UI_MISSING_OR_INVALID_EVIDENCE` enum is misleading here: its specific reason is `PRODUCT_S09_STALE_DEBOUNCE_SAVE_AFTER_UNDO`; actual evidence checks pass.

Root cause: `if (!hasChanged) return;` at line 461 runs before cancellation of the previous timer at line 465. Restoring the saved value returns early while the timer holding A survives. Backend persists the stale payload it receives.

Smallest proposed change: cancel and null the outstanding timeout before the unchanged-value early return. When reverting to the known saved snapshot, restore the saved indicator. Preserve the existing normal debounce for changed values. Illustrative ordering:

```ts
if (autosaveTimeoutRef.current) {
  clearTimeout(autosaveTimeoutRef.current);
  autosaveTimeoutRef.current = null;
}
if (!hasChanged) {
  // Restore the existing saved-state indicator here.
  return;
}
// Schedule the existing save of the current snapshot.
```

Required verification after an independently authorized product patch: saved B → A → B within debounce must send no stale PATCH and create no stale revision/outbox; A → distinct B must persist latest B; unchanged save remains idempotent. Investigate an already in-flight request as a separate race; timer cancellation alone does not prove that case safe. Retest S09 before S10/S11. Do not repair this run's DB or overwrite the failure evidence.
