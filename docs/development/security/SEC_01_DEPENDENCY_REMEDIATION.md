# SEC-01 — Production dependency security remediation

| Field | Value |
|---|---|
| Base | `integration/p2-planning-studio` @ `00925084a9f48379d39db5d0a7c5fa3d494f3096` (same lockfiles as P2-09 tested source) |
| Branch | `codex/sec-01-production-dependency-remediation` (independent of PR #131) |
| Toolchain | Node v22.14.0, npm 10.9.2, `npm ci` before every audit |
| Audit command | `cd backend && npm audit --omit=dev --json`; `cd web && npm audit --omit=dev --json` |
| Verdict | **`SECURITY_PARTIAL`** — every Critical is fixed; one High (`zod`) is mitigated in code, and its upstream fix needs a major upgrade that is held for owner decision |

## Before / after (production dependencies only)

| Project | Before | After |
|---|---|---|
| backend (128 prod deps) | critical 1, high 2, moderate 1 | critical 0, **high 1 (`zod`, mitigated)**, moderate 0 |
| web (74 prod deps) | high 4 | **0** |

## Advisory matrix

| Advisory | Dependency | Installed version | Affected range | Exploitability | Remediation | Residual risk | Evidence |
|---|---|---|---|---|---|---|---|
| GHSA-jqcg-44mw-7w3h (critical) — IP spoofing via IPv4-mapped IPv6 trust subnet | `proxy-addr` (backend: express → proxy-addr) | 2.0.7 → **2.0.8** | ≥1.1.0 <2.0.8 | Low in current topology. Exploit needs a configured trust subnet (e.g. `::ffff:10.0.0.0/8`). Backend never calls `app.set('trust proxy')`; runtime check: `trust proxy = false`, trust fn returns false for any address. No `req.ip`/`req.ips`/`X-Forwarded-For`/`X-Real-IP` use, no IP-based rate limit or authorization under `backend/src`. nginx (`web/nginx.conf`) sets `X-Real-IP`/`X-Forwarded-For` but the backend ignores them. | **FIXED** — lockfile update within express's `~2.0.7` range | None now. If `trust proxy` is enabled later, use explicit, correctly-prefixed subnets | `npm ls proxy-addr` → 2.0.8; audit after |
| GHSA-27r3-jxmh-p828 (high) — crash via trailing bytes after compressed body | `body-parser` (express → body-parser) | 1.20.6 → **1.20.9** | <1.20.9 | **Applicable.** `app.use(express.json({ limit: '1mb' }))` uses body-parser with default inflate; any route, no auth, one request with `Content-Encoding: gzip` + trailing bytes crashes the process | **FIXED** — express 4.22.2 → 4.22.3 (patch) pulls body-parser 1.20.9 | None known | `npm ls body-parser` → 1.20.9 |
| GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw (moderate) — `qs` array-limit bypass / stringify throws | `qs` (express, body-parser) | 6.15.3 → **6.16.2** | ≤6.16.0 (patched 6.16.1) | Partly applicable: express `extended` query parsing uses `qs.parse`; the throwing paths are `qs.stringify` options not used by backend code | **FIXED** — via express 4.22.3 (`qs ~6.16.0`) | None known | `npm ls qs` → 6.16.2 |
| GHSA-mrhx-c7xc-m3w5 (high) — memory exhaustion validating oversized arrays | `zod` (direct) | 3.25.76 (unchanged) | <4.6.6 (patched 4.6.6) | **Applicable, measured.** With the 1 MB body limit, 349,521 invalid elements in `tags` produce 349,521 issues, ~145 MB heap, 268 ms per request on zod 3.25.76. Adding `.max()` alone does **not** help (zod 3 still validates every element: 349,522 issues, ~152 MB). Concurrent requests could exhaust memory. Reachable by any AUTHOR (self-service). Affected schemas: novel `tags` (create/update, previously unbounded), `genres` (`.max(5)`), chapter order `chapterIds` (`.max(10000)`) | **MITIGATED** — `boundedArray()` rejects oversized arrays with one fatal issue **before** element validation (same probe: 1 issue, ~0 MB, 1 ms). Applied to all request array schemas; `tags` bounded at 20 (`MAX_NOVEL_TAGS`), `genres` 5, `chapterIds` 1..10000. Upgrade to zod 4 **BLOCKED for owner review** (major; 22 backend files import zod) | `npm audit` still reports it until zod ≥4.6.6. New array schemas must use `boundedArray`. `tags` > 20 now returns 400 (behaviour change) | `src/core/validation/bounded-array.test.ts` (5 tests) |
| GHSA-vh66-26gq-q6x8, -9fr6-4gfg-395g, -c29m-xwm3-cm6r, -mghh-pgcx-3jjj, -x97p-jq2g-jp4f, -3pq3-5fj3-cg6v, -542g-h47m-68v8, -j8rh-479h-cp32, -4hqw-qxg8-jxx2, -m8m8-qj5v-23w3, -44g4-m2mj-wpvx, -r4gj-5m52-g5wh (high) | `axios` (web direct) | 1.18.1 → **1.21.1** | <1.20.0 | Low: web bundle runs in the browser (XHR/fetch adapter); most issues need Node http/http2 adapters, proxy env or prior prototype pollution. Fetch-adapter header/redirect issues are reachable in principle | **FIXED** — lockfile update within `^1.7.9` | None known | `npm ls axios` |
| GHSA-q3jh-wrc6-jgq8, -8r9p-f939-6h3c, -mrwp-f3q8-3g9p (high) | `follow-redirects` (axios) | 1.16.0 → **1.16.3** | ≥1.16.0 ≤1.16.1 | Not used by axios in the browser build (Node adapter only) | **FIXED** — via axios update | None | `npm ls follow-redirects` |
| GHSA-qwww-vcr4-c8h2 (high) — RSC-mode CSRF | `react-router` / `react-router-dom` | 7.18.1 → **7.18.5** | ≥7.12.0 <7.18.2 | Not applicable: SPA, no unstable RSC APIs | **FIXED** — lockfile update within `^7.1.1` | None | `npm ls react-router-dom` |

## Updated production dependency tree (changed nodes)

```
backend: express@4.22.3 ├─ body-parser@1.20.9 ─ qs@6.16.2 ├─ proxy-addr@2.0.8 └─ qs@6.16.2 ; zod@3.25.76 (unchanged)
web:     axios@1.21.1 ─ follow-redirects@1.16.3 ; react-router-dom@7.18.5 ─ react-router@7.18.5
```

No `package.json` ranges changed; only lockfiles. `npm ci` reproduces the tree. No `npm audit fix --force`, no overrides, no advisory suppression.

## Changed files

- `backend/package-lock.json`, `web/package-lock.json` — in-range patch/minor updates above.
- `backend/src/core/validation/bounded-array.ts` — new pre-validation length guard (zod 3 mitigation).
- `backend/src/core/validation/bounded-array.test.ts` — new tests (oversized input → 1 issue; min/max semantics; novel tags/genres).
- `backend/src/modules/novels/novels.schemas.ts` — `tags` (20), `genres` (5) use `boundedArray`.
- `backend/src/modules/novels/chapter-lifecycle.ts` — `chapterIds` (1..10000) uses `boundedArray`.
- This report.

## Tests (local, exact final source; CI links on the PR)

| Command | Result |
|---|---|
| `cd backend && npx tsc --noEmit -p .` | exit 0 |
| `npx tsx --test src/core/validation/bounded-array.test.ts` | 5/5 pass |
| P8 backend deterministic set with CI env (`find src -name '*.test.ts' ! -name '*.live.test.ts' ! -name '*.postgres.test.ts' ! -name 'accept-draft-contract.test.ts'`, 23 files) | 156 tests: 153 pass, 3 skipped, 0 fail |
| `cd web && npm run build` | exit 0 |
| `npx tsx --test tests/author-context.test.ts tests/entity-casefold-python.test.ts`; `node --test tests/api-client-security.browser.test.mjs` | exit 0; api-client-security 2/2 pass |
| P2 browser regressions (`p2-06b-bui-regressions`, `p2-06b-brainstorming`, `planning-studio`, `p2-07f-ux05-world-amendment`) | all exit 0 (Edge, mocked HTTP) |
| Audits after | backend high 1 (`zod`, mitigated); web 0 |

Not re-run locally: DB-backed `*.postgres.test.ts`/`*.live.test.ts`, P1 writer browser suites and the integrated S1–S7 runner — they run in P2/P8 CI on this PR. Gateway/auth code is unchanged; the dependency changes touch request parsing (body-parser, qs), which those CI suites exercise.

## Remaining Critical/High

- `zod` GHSA-mrhx-c7xc-m3w5 (High): mitigated in code; upstream fix requires zod 4. **Owner decision:** accept the mitigation until a planned zod 4 migration, or schedule that migration now.

## Rollback

Revert this PR: lockfiles return to the previous versions (re-opens the critical/high advisories) and `tags` becomes unbounded again. No schema, data or API contract migration is involved; the only behaviour change is that `tags` > 20, `genres` > 5 and `chapterIds` > 10000 return 400 before element validation (the last two limits already existed).
