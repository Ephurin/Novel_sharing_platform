# Actual mounted acceptance

One real production-SPA scenario, 28 mandatory stages; all executed against Gateway/Python/PG/Mongo. Fixture preparation is explicitly separated from browser human decisions.

| Stage | Result |
|---|---|
| G4 prerequisite: actual locally built styles/fonts, no CDN substitution | PASS |
| FIXTURE only: owned accounts/projects and empty baseline; no pre-approved named Canon | PASS |
| G1: draft 401/403/404 and required-version 428 do not mutate scoped durable state | PASS |
| G2: real login, production SPA, B→A→B Undo before debounce | PASS |
| G2: in-flight A→B serial saves, real revisions/outbox/Mongo | PASS |
| G2: real stale 409 displayed in UI and server-version recovery | PASS |
| G2: switch chapter while dirty, flush only the old chapter | PASS |
| G2: novel navigation before debounce cannot write the next context | PASS |
| G2: pending account switch cannot restore the previous owner context | PASS |
| G3/S10: manuscript saved by UI, immutable-source checkpoint; no machine identity approval | PASS |
| G3/S11: UI partial review persists one human group; interrupted review resumes | PASS |
| G3/S10: two real UI sessions cause review CAS 409; dirty human choices survive without DB mutation | PASS |
| G3/S10: explicit guidance refresh preserves compatible human decisions and adds pending name | PASS |
| G3/S10: UI separates homonyms, groups repeated occurrences, freezes and reloads stable UUIDs | PASS |
| G3/S10: UI Continue creates exact-ID proposals; complete edited group acceptance alone commits Canon | PASS |
| G3/S10: UI correction creates a multi-member pending group without changing approved memory | PASS |
| G3/S10: browser atomic group rejection persists both author decisions with no Canon/version change | PASS |
| G3/S10: separate UI correction and complete approval preserve immutable event provenance | PASS |
| G3/S10: mounted consistency uses approved current state and an actual immutable revision | PASS |
| G3/S10: author corrects the identified contradiction and separately approves the complete group | PASS |
| G3/S10: exact-ID author locks distinguish homonymous subjects | PASS |
| G3/S11: pending correction survives reload, without entering Canon or changing UUIDs/locks | PASS |
| S11: actual SPA logout/login clears private account context without a document reload | PASS |
| G4 fixture only: local published reader rows, separate private Mongo drafts; no publish endpoint | PASS |
| G4: actual Reader/free content, VIP lock, private draft denial, library/history, wallet and notifications | PASS |
| G4: Author comment/review screens and real media upload round trip | PASS |
| G4: real Author scheduling form, dark theme/mobile and reload continuity; no schedule/publish | PASS |
| G4: actual Admin role access and moderation/novel management read smoke | PASS |

Full HTTP bodies, actor IDs, full scoped SQL/Mongo before/after states, screenshots and sanitized Playwright trace are in browser/. No optional locator skips. Named steps are stages, not 28 independent Node test cases.
