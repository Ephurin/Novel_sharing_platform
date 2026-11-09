# P2-07A — UX-02 Fix Handoff (`REPRO_NOT_CONFIRMED`)

- **Issue**: [#103 — `[P2-07A][Gemini 4 Argon][P0] Fix logout/session expiry deadlock with dirty Writer draft (UX-02)`](https://github.com/Ephurin/Novel_sharing_platform/issues/103)
- **Repository**: `Ephurin/Novel_sharing_platform`
- **Target Integration Branch**: `integration/p2-planning-studio`
- **Baseline SHA**: `c50b57a886d6db2eb3b409c30b91eb3f63876b09`
- **Working Branch**: `gemini/p2-07a-ux02-session-exit`
- **Verdict**: **`REPRO_NOT_CONFIRMED`** (No speculative production code modifications applied, per Issue #103 & P2-07A contract)

---

## 1. Executive Verdict: `REPRO_NOT_CONFIRMED`

Per the mandatory reproduction-first gate in Issue #103:

> *"If the claimed UX-02 failure cannot be reproduced on the actual codebase, report `REPRO_NOT_CONFIRMED`, explain why with exact steps/trace, and stop without making a speculative auth rewrite."*

We inspected `web/src/features/auth/AuthGate.tsx`, `web/src/features/author-ide/useDraftPersistence.ts`, `web/src/features/author-ide/AuthorWritingIde.tsx`, and `web/src/app/router.tsx` at baseline SHA `c50b57a886d6db2eb3b409c30b91eb3f63876b09`, and executed mounted browser reproduction suites across both:
1. **Real browser (`msedge`) + Real Fastify API + Real PostgreSQL 16 + Real MongoDB 7** (`author-ide.browser.test.mjs` / `draft-persistence.browser.test.mjs` harness).
2. **Real browser (`msedge`) + Mounted `appRouter` (`AuthGate` + `RoleGuard` + `AuthorTheme` + `AuthorWritingIde`)** across 7 distinct session-exit and dirty-draft scenarios (Cases A–G).

**Finding**: Across every tested scenario, **logging out or expiring the session (`useAuthStore.getState().clearSession()`) while `useDraftPersistence.dirty === true` never deadlocks React Router or strands the user on `/author/ide`**. Furthermore, we traced the original `P2_07A_UX_AUDIT_GEMINI.md` script that logged UX-02 and proved that its failure check was a **synchronous-evaluation false positive**.

In strict compliance with the P2-07A boundaries, **zero production files (`AuthGate.tsx`, `useDraftPersistence.ts`, `AuthorWritingIde.tsx`) were modified**. To permanently guard this contract in CI, we added Step 9 (`UX-02 Regression`) to `web/tests/author-ide.browser.test.mjs` and mounted `<AuthGate>` + `/login` in `web/tests/fixtures/author-ide-fixture.tsx`.

---

## 2. Codebase Lifecycle Analysis (`AuthGate` + `useDraftPersistence` + `AuthorWritingIde`)

In `web/src/app/router.tsx` (lines 51–59), `/author/ide` is mounted inside `<AuthGate>`:

```tsx
{
  path: '/author/ide',
  element: (
    <AuthGate>
      <RoleGuard allowedRoles={['AUTHOR', 'ADMIN']}>
        <AuthorTheme>
          <AuthorWritingIde />
        </AuthorTheme>
      </RoleGuard>
    </AuthGate>
  )
}
```

When the user logs out (`clearSession()`) or when `AuthGate` detects an expired/invalid session (`currentUserQuery.isError` -> `clearSession()` in `AuthGate.tsx` lines 31–41):

1. `useAuthStore` synchronously sets `accessToken: null, refreshToken: null, user: null`.
2. On the resulting React render commit, `AuthGate` (`AuthGate.tsx` lines 43–45) branches to:
   ```tsx
   if (!accessToken) {
     return <Navigate to="/login" replace />;
   }
   ```
3. **Component Unmount Before Navigation Effect**:
   - Replacing `<RoleGuard><AuthorTheme><AuthorWritingIde /></AuthorTheme></RoleGuard>` with `<Navigate to="/login" replace />` **unmounts `AuthorWritingIde` and `useDraftPersistence`** during the commit phase.
   - Inside React Router v7 (`react-router-dom` `7.1.1`), `useBlocker(dirty)` in `useDraftPersistence.ts` (line 86) cleans up and **unregisters its blocker from `router.state.blockers` during unmount cleanup**, *before* `<Navigate to="/login" replace />`'s passive `useEffect` executes `navigate('/login', { replace: true })`.
   - As a result, when `<Navigate to="/login" replace />` fires its navigation effect, `router.state.blockers` is already empty (`[]`), and the browser transitions cleanly to `/login` without ever being intercepted by `useBlocker`.
4. **Local Draft Protection & Multi-Account Isolation**:
   - Before `clearSession()` is triggered, every keystroke in `AuthorWritingIde` synchronously writes the draft backup to `localStorage` under `storycraft-draft:${userId}:${chapterId}` (`useDraftPersistence.ts` lines 16, 108–112).
   - If an autosave `PATCH` is in flight when `AuthorWritingIde` unmounts, `mounted.current` becomes `false` (`useDraftPersistence.ts` lines 37, 87). When the in-flight request resolves or rejects after unmount, line 48 (`if (!slot.pending && !slot.retired && mounted.current)`) prevents `removeBackup(key)` from deleting the local backup.
   - Because the `localStorage` key is namespaced by `userId` (`storycraft-draft:${userId}:${chapterId}`), logging in as `author-B` on the same browser never reads or inherits `author-A`'s unsaved draft, and when `author-A` logs back in, `author-A` recovers their unsaved local draft via `readBackup` (`useDraftPersistence.ts` lines 17–23, 66–81).

---

## 3. Why the Original Audit Reported UX-02 (Root Cause of the False Positive)

In the original UX audit script (`run-ux-audit.mjs` lines 386–390) that generated `docs/development/p2/P2_07A_UX_AUDIT_GEMINI.md`, the S4 check executed:

```js
const isBlocked = await page.evaluate(async () => {
  const { useAuthStore } = await import('/src/features/auth/useAuthStore.ts');
  useAuthStore.getState().clearSession();
  return window.location.pathname.includes('/author/ide');
});
```

Why this produced a false positive:
1. **`window.location.pathname` was read synchronously on the exact next statement after `clearSession()`** within the same JavaScript execution turn, before yielding to React 19's microtask render commit and `<Navigate to="/login" replace />`'s `useEffect`.
2. Even when `dirty === false` and `router.state.blockers.size === 0`, `window.location.pathname` is *always* still `'/author/ide'` on the synchronous line immediately following `useAuthStore.getState().clearSession()`, and transitions to `'/login'` immediately after React commits the effect (`resultG` in trace below: `syncAuditCheck: true, syncBlockerCount: 0, postEffectPathname: "/login"`).
3. Moreover, in `run-ux-audit.mjs` S4, the test had typed into Planning Studio's `Ghi chú kế hoạch riêng tư` textarea (`useStoryPlanController`) rather than the Writer chapter manuscript editor (`useDraftPersistence`), so `useDraftPersistence.dirty` was not even active during that check.

---

## 4. Exhaustive Reproduction Matrix & Diagnostic Trace (Cases A–G)

We executed all 7 candidate failure modes in a real Chromium (`msedge`) browser mounting the actual `appRouter` (`AuthGate` + `AuthorWritingIde` + `useDraftPersistence`). Full trace output is archived at [`docs/development/p2/evidence/p2-07a/ux02-diagnostic-trace.json`](evidence/p2-07a/ux02-diagnostic-trace.json).

| Case | Scenario Tested | Observed Router / Blocker Trace | Result |
| :--- | :--- | :--- | :--- |
| **Case A** | Author types unsaved manuscript text (`dirty === true`, within 1200ms debounce window) -> `clearSession()` called | `syncPathname: "/author/ide"` -> `after100msPathname: "/login"`, `after100msBlockers: []`. Unsaved draft preserved in `localStorage` under `storycraft-draft:{authorA}:{chapterId}`. | **Clean exit to `/login` (No deadlock)** |
| **Case B** | Author types unsaved manuscript text -> `PATCH /chapters/:id` is in-flight (`slot.running === true`) -> `clearSession()` called mid-save | `after100msPathname: "/login"`, `after100msBlockers: []`. `mounted.current === false` prevents post-unmount `removeBackup`. | **Clean exit to `/login` (No deadlock)** |
| **Case C** | Author clicks an in-app route while `dirty === true`, opening the `AuthorDialog` blocker modal (`blocker.state === "blocked"`), and *then* session expires (`clearSession()`) while the modal is open | `beforeBlockers: [["6", { "state": "blocked" }]]` -> `after100msPathname: "/login"`, `after100msBlockers: []`, `bodyOverflow: ""`. Both `AuthorWritingIde` and `AuthorDialog` unmount cleanly. | **Clean exit to `/login` (No deadlock)** |
| **Case D** | Author triggers `useBlocker` modal via in-app navigation and clicks `Lưu và rời trang`, but the `PATCH` save returns `401 Unauthorized` while `accessToken` is still in `useAuthStore` | `pathname: "/author/ide"`, `dialogOpen: true` remains visible and interactive (`Ở lại` / `Rời trang` clickable), status updates to error, local backup preserved. | **Interactive recovery (No deadlock)** |
| **Case E** | Direct `appRouter.navigate('/login')` while still authenticated (`accessToken !== null`) and `dirty === true` | `pathname: "/author/ide"`, `dialogOpen: true` with buttons `Lưu và rời trang`, `Ở lại`, `Rời trang`. | **Expected guard dialog (No deadlock)** |
| **Case F** | Synchronous `clearSession()` followed immediately by `appRouter.navigate('/login', { replace: true })` in the same event handler | `syncBlockers` transiently records `"blocked"` before React render commit, then React commits `AuthGate` unmount -> `after200msPathname: "/login"`, `after200msBlockers: []`, `dialogOpen: false`, `/login` page rendered. | **Clean exit to `/login` (No deadlock)** |
| **Case G** | Exact `run-ux-audit.mjs` synchronous check (`clearSession(); return window.location.pathname.includes('/author/ide')`) with `dirty === false` | `syncAuditCheck: true`, `syncBlockerCount: 0` -> `postEffectPathname: "/login"`, `postEffectBlockerCount: 0`. | **Proves audit script check was a synchronous-timing false positive** |

### Multi-Account Draft Isolation Verification (Real DB + Real Browser)

Using the real Fastify backend + PostgreSQL 16 + MongoDB 7 fixture (`author-ide.browser.test.mjs` / `draft-persistence.browser.test.mjs`):
1. **`author-1` (`11111111-1111-4111-8111-111111111101`)** typed unsaved draft content `"Đoạn nháp chưa lưu trước khi hết phiên đăng nhập."` and triggered `clearSession()` before the 1200ms autosave debounce fired.
   - Browser redirected cleanly to `/login` (`pathname === "/login"`).
   - `localStorage.getItem("storycraft-draft:11111111-1111-4111-8111-111111111101:33333333-3333-4333-8333-333333333301")` retained the unsaved draft JSON.
   - Zero `PATCH` requests were committed to PostgreSQL.
2. **`author-2` (`11111111-1111-4111-8111-111111111102`)** logged in on the same browser context:
   - `localStorage.getItem("storycraft-draft:11111111-1111-4111-8111-111111111102:33333333-3333-4333-8333-333333333301")` was `null` (`author-2` never inherited `author-1`'s draft).
3. **`author-1`** logged back in and navigated to `/author/ide?novelId=22222222-2222-4222-8222-222222222201`:
   - `AuthorWritingIde` displayed `"Có bản lưu trên máy chưa đồng bộ"`, and clicking `"Khôi phục vào trình soạn thảo"` restored `"Bản nháp chưa lưu trước khi hết phiên đăng nhập (UX-02 verification)."` from `author-1`'s local backup into the editor and persisted it to PostgreSQL.

### Evidence Artifacts

- Diagnostic trace JSON: [`docs/development/p2/evidence/p2-07a/ux02-diagnostic-trace.json`](evidence/p2-07a/ux02-diagnostic-trace.json)
- Post-logout `/login` screenshot (Vite router diagnostic): [`docs/development/p2/evidence/p2-07a/ux02-repro-not-confirmed-login.png`](evidence/p2-07a/ux02-repro-not-confirmed-login.png)
- Post-logout `/login` screenshot (Real API + DB harness): [`docs/development/p2/evidence/p2-07a/ux02-logout-clean-exit.png`](evidence/p2-07a/ux02-logout-clean-exit.png)

---

## 5. Build, Typecheck & Browser Regression Suite Results

All required verification suites were executed on branch `gemini/p2-07a-ux02-session-exit` (baseline SHA `c50b57a886d6db2eb3b409c30b91eb3f63876b09`):

| Check / Suite | Command | Exit Code | Result |
| :--- | :--- | :---: | :---: |
| **Frontend Typecheck** | `npm --prefix web run typecheck` | `0` | **PASS** |
| **Frontend Production Build** | `npm --prefix web run build` | `0` | **PASS** (`built in 13.45s`) |
| **Draft Persistence Browser Regression (Real API + PG/Mongo)** | `npm --prefix web run test:draft-browser` (`PLAYWRIGHT_CHANNEL=msedge`, `RUN_DRAFT_BROWSER_TESTS=1`) | `0` | **PASS** (`14884.4ms`) |
| **Author IDE Browser Regression (Real API + PG/Mongo)** | `npm --prefix web run test:author-ide-browser` (`PLAYWRIGHT_CHANNEL=msedge`, `RUN_AUTHOR_IDE_BROWSER_TESTS=1`) | `0` | **PASS** (`18315.1ms`) |
| **Planning Studio Browser Regression (HTTP Mocks)** | `node --test web/tests/planning-studio.browser.test.mjs` (`PLAYWRIGHT_CHANNEL=msedge`, `RUN_PLANNING_STUDIO_BROWSER_TESTS=1`) | `0` | **PASS** (`39805.5ms`) |

---

## 6. Guardrails & Boundary Compliance

- `useBlocker` in `useDraftPersistence.ts`: **Untouched (100% intact)**.
- Local draft backups in `localStorage`: **Untouched (never deleted on session exit)**.
- Backend / PostgreSQL / MongoDB / P1 Canon: **Untouched**.
- Live LLM usage: **None** (offline / fake provider only).
- Secrets / JWTs / API keys / private notes in report or evidence: **None**.

